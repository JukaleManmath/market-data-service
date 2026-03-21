import json
import logging
from datetime import datetime
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.kafka.producer import send_portfolio_event
from app.models.portfolio import Portfolio
from app.models.position import Position
from app.models.price_points import PricePoint
from app.schemas.portfolio import PortfolioSnapshot, PositionSnapshot

logger = logging.getLogger(__name__)


class PortfolioService:
    """
    Manages portfolios and positions.

    Responsibilities:
      - create_portfolio()         — persist a named portfolio
      - add_or_update_position()   — buy shares; recalculates weighted avg cost basis
      - close_position()           — mark position inactive, record realized P&L event
      - get_snapshot()             — compute live P&L by joining positions with Redis prices
    """

    def __init__(self, db: AsyncSession, cache: Redis) -> None:
        self.db = db
        self.cache = cache

    # ------------------------------------------------------------------
    # Portfolio CRUD
    # ------------------------------------------------------------------

    async def create_portfolio(self, name: str) -> Portfolio:
        portfolio = Portfolio(name=name)
        self.db.add(portfolio)
        await self.db.commit()
        await self.db.refresh(portfolio)
        logger.info(f"[Portfolio] Created portfolio '{name}' id={portfolio.id}")
        return portfolio

    # ------------------------------------------------------------------
    # Position management
    # ------------------------------------------------------------------

    async def delete_portfolio(self, portfolio_id: UUID) -> None:
        """Close all active positions then delete the portfolio row."""
        portfolio_result = await self.db.execute(
            select(Portfolio).where(Portfolio.id == portfolio_id)
        )
        portfolio = portfolio_result.scalar_one_or_none()
        if portfolio is None:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        await self.db.execute(
            delete(Position).where(Position.portfolio_id == portfolio_id)
        )

        await self.db.delete(portfolio)
        await self.db.commit()
        logger.info(f"[Portfolio] Deleted portfolio {portfolio_id}")

    async def add_or_update_position(
        self,
        portfolio_id: UUID,
        symbol: str,
        quantity: float,
        price: float,
        provider: str = "finnhub",
    ) -> Position:
        """
        Buy `quantity` shares of `symbol` at `price`.

        If an active position for this symbol already exists in the portfolio,
        the quantity is increased and avg_cost_basis is recalculated using the
        weighted average formula:

            new_avg = (old_qty * old_avg + new_qty * new_price) / (old_qty + new_qty)
        """
        result = await self.db.execute(
            select(Position).where(
                Position.portfolio_id == portfolio_id,
                Position.symbol == symbol,
                Position.is_active == True,
            )
        )
        position = result.scalar_one_or_none()

        if position:
            total_qty = position.quantity + quantity
            position.avg_cost_basis = (
                position.quantity * position.avg_cost_basis + quantity * price
            ) / total_qty
            position.quantity = total_qty
            logger.info(f"[Portfolio] Updated position {symbol} in portfolio {portfolio_id}")
        else:
            position = Position(
                portfolio_id=portfolio_id,
                symbol=symbol,
                provider=provider,
                quantity=quantity,
                avg_cost_basis=price,
            )
            self.db.add(position)
            logger.info(f"[Portfolio] Opened position {symbol} in portfolio {portfolio_id}")

        await self.db.commit()
        await self.db.refresh(position)

        await send_portfolio_event(
            event_type="position_updated",
            portfolio_id=str(portfolio_id),
            symbol=symbol,
            quantity=position.quantity,
            avg_cost_basis=position.avg_cost_basis,
        )

        return position

    async def close_position(self, portfolio_id: UUID, position_id: UUID) -> Position:
        result = await self.db.execute(
            select(Position).where(
                Position.id == position_id,
                Position.portfolio_id == portfolio_id,
                Position.is_active == True,
            )
        )
        position = result.scalar_one_or_none()

        if position is None:
            raise ValueError(f"Active position {position_id} not found in portfolio {portfolio_id}")

        position.is_active = False
        position.closed_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(position)

        logger.info(f"[Portfolio] Closed position {position_id} ({position.symbol})")

        await send_portfolio_event(
            event_type="position_closed",
            portfolio_id=str(portfolio_id),
            symbol=position.symbol,
            quantity=0,
            avg_cost_basis=position.avg_cost_basis,
        )

        return position

    # ------------------------------------------------------------------
    # Snapshot
    # ------------------------------------------------------------------

    async def get_snapshot(self, portfolio_id: UUID) -> PortfolioSnapshot:
        """
        Compute a live P&L snapshot for all active positions.

        Price lookup order:
          1. Redis cache  (key: "{symbol}:{provider}")
          2. DB fallback  (most recent price_point for symbol + provider)
        """
        portfolio_result = await self.db.execute(
            select(Portfolio).where(Portfolio.id == portfolio_id)
        )
        portfolio = portfolio_result.scalar_one_or_none()
        if portfolio is None:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        positions_result = await self.db.execute(
            select(Position).where(
                Position.portfolio_id == portfolio_id,
                Position.is_active == True,
            )
        )
        positions = positions_result.scalars().all()

        position_snapshots: list[PositionSnapshot] = []
        total_value = 0.0

        for pos in positions:
            current_price = await self._get_current_price(pos.symbol, pos.provider)
            market_value = pos.quantity * current_price
            total_value += market_value
            position_snapshots.append(
                PositionSnapshot(
                    position_id=pos.id,
                    symbol=pos.symbol,
                    provider=pos.provider,
                    quantity=pos.quantity,
                    avg_cost_basis=pos.avg_cost_basis,
                    current_price=current_price,
                    market_value=market_value,
                    unrealized_pnl=market_value - (pos.quantity * pos.avg_cost_basis),
                    pnl_pct=(
                        (current_price - pos.avg_cost_basis) / pos.avg_cost_basis
                        if pos.avg_cost_basis > 0
                        else 0.0
                    ),
                    weight=0.0,  # filled in after total_value is known
                )
            )

        # Back-fill weights now that total_value is known
        for snap in position_snapshots:
            snap.weight = snap.market_value / total_value if total_value > 0 else 0.0

        total_pnl = sum(s.unrealized_pnl for s in position_snapshots)

        return PortfolioSnapshot(
            portfolio_id=portfolio_id,
            portfolio_name=portfolio.name,
            total_value=total_value,
            total_pnl=total_pnl,
            positions=position_snapshots,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_current_price(self, symbol: str, provider: str) -> float:
        """Try Redis first, fall back to the most recent DB price_point."""
        cache_key = f"{symbol.lower()}:{provider}"
        raw = await self.cache.get(cache_key)
        if raw:
            data = json.loads(raw)
            logger.info(f"[Portfolio Snapshot] Cache hit for {symbol}")
            return float(data["price"])

        result = await self.db.execute(
            select(PricePoint)
            .where(PricePoint.symbol == symbol, PricePoint.provider == provider)
            .order_by(PricePoint.timestamp.desc())
            .limit(1)
        )
        row = result.scalars().first()
        if row:
            logger.info(f"[Portfolio Snapshot] DB hit for {symbol}")
            return row.price

        logger.warning(f"[Portfolio Snapshot] No price found for {symbol}/{provider}, defaulting to 0")
        return 0.0
