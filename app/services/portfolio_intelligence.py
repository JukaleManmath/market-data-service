"""
Portfolio intelligence service.

Gathers the full portfolio context — snapshot, risk metrics, technical indicators,
active alerts, and 7-day price changes — then asks Claude for a structured analysis.

Result is cached in Redis for 5 minutes to avoid redundant API calls.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm_client import get_llm_client
from app.models.alerts import Alert
from app.models.price_points import PricePoint
from app.models.position import Position
from app.prompts.portfolio_analysis import build_analysis_prompt
from app.services.risk_engine import RiskEngine
from app.services.signal_generator import SignalGenerator
from app.services.technical_analysis import TechnicalAnalysisService

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes


class PortfolioIntelligenceService:
    """
    Builds full-portfolio context and asks Claude for a structured analyst report.

    Injected deps (same pattern as PriceService / AIInsightsService):
      - db:    AsyncSession — for price history, positions, alerts
      - cache: Redis        — for snapshot prices + result caching
    """

    def __init__(self, db: AsyncSession, cache: Redis, llm_provider: str | None = None) -> None:
        self._db = db
        self._cache = cache
        self._client = get_llm_client(provider=llm_provider)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def analyze(self, portfolio_id: UUID) -> dict:
        """
        Return a structured Claude analysis for the portfolio.

        Checks Redis first (key: portfolio_analysis:{portfolio_id}).
        On miss, fetches context, calls Claude, parses JSON, caches, returns.
        """
        cache_key = f"portfolio_analysis:{portfolio_id}"
        cached = await self._cache.get(cache_key)
        if cached:
            logger.info(f"[Intelligence] Cache hit for portfolio {portfolio_id}")
            result = json.loads(cached)
            result["cached"] = True
            return result

        logger.info(f"[Intelligence] Building context for portfolio {portfolio_id}")
        context = await self._fetch_context(portfolio_id)

        prompt = build_analysis_prompt(
            snapshot=context["snapshot"],
            risk=context["risk"],
            indicators_by_symbol=context["indicators"],
            alerts=context["alerts"],
            price_changes=context["price_changes"],
        )

        logger.info(f"[Intelligence] Calling Claude for portfolio {portfolio_id}")
        raw = await self._call_claude(prompt)
        result = self._parse_response(raw, portfolio_id)

        await self._cache.setex(cache_key, CACHE_TTL, json.dumps(result, default=str))
        logger.info(f"[Intelligence] Analysis cached for portfolio {portfolio_id} (TTL={CACHE_TTL}s)")

        result["cached"] = False
        return result

    # ------------------------------------------------------------------
    # Context assembly
    # ------------------------------------------------------------------

    async def _fetch_context(self, portfolio_id: UUID) -> dict:
        snapshot = await self._fetch_snapshot(portfolio_id)
        risk = await self._fetch_risk(portfolio_id)
        indicators = await self._fetch_indicators(snapshot)
        alerts = await self._fetch_alerts(snapshot)
        price_changes = await self._fetch_price_changes(snapshot)

        return {
            "snapshot": snapshot,
            "risk": risk,
            "indicators": indicators,
            "alerts": alerts,
            "price_changes": price_changes,
        }

    async def _fetch_snapshot(self, portfolio_id: UUID) -> dict:
        """Lightweight snapshot: positions with current prices from Redis or DB."""
        from app.services.portfolio_service import PortfolioService

        svc = PortfolioService(db=self._db, cache=self._cache)
        snap = await svc.get_snapshot(portfolio_id)
        return snap.model_dump()

    async def _fetch_risk(self, portfolio_id: UUID) -> dict:
        engine = RiskEngine(self._db)
        result = await engine.compute(portfolio_id)
        return {
            "var_1day_95": result.var_1day_95,
            "sharpe_ratio": result.sharpe_ratio,
            "max_drawdown": result.max_drawdown,
            "correlation_matrix": result.correlation_matrix,
            "symbols_analysed": result.symbols_analysed,
            "warning": result.warning,
        }

    async def _fetch_indicators(self, snapshot: dict) -> dict[str, dict]:
        """Compute RSI/MACD/Bollinger + BUY/SELL/HOLD signal for each active position."""
        ta = TechnicalAnalysisService(self._db)
        sg = SignalGenerator()
        result: dict[str, dict] = {}

        for pos in snapshot.get("positions", []):
            symbol: str = pos["symbol"]
            provider: str = pos["provider"]
            indicators = await ta.compute(symbol, provider)
            signal = sg.generate(indicators, pos["current_price"])

            result[symbol] = {
                "rsi": indicators.rsi,
                "macd": (
                    {
                        "line": indicators.macd.line,
                        "signal": indicators.macd.signal,
                        "histogram": indicators.macd.histogram,
                    }
                    if indicators.macd
                    else None
                ),
                "bollinger": (
                    {
                        "upper": indicators.bollinger.upper,
                        "middle": indicators.bollinger.middle,
                        "lower": indicators.bollinger.lower,
                    }
                    if indicators.bollinger
                    else None
                ),
                "signal": signal.signal.value,
                "confidence": signal.confidence,
                "reasons": signal.reasons,
            }

        return result

    async def _fetch_alerts(self, snapshot: dict) -> list[dict]:
        """Fetch unresolved alerts for each symbol held in the portfolio."""
        symbols = [pos["symbol"] for pos in snapshot.get("positions", [])]
        if not symbols:
            return []

        result = await self._db.execute(
            select(Alert).where(
                Alert.symbol.in_(symbols),
                Alert.resolved == False,  # noqa: E712
            )
        )
        alerts = result.scalars().all()

        return [
            {
                "id": str(a.id),
                "symbol": a.symbol,
                "anomaly_type": a.anomaly_type,
                "severity": a.severity,
                "price": a.price,
                "z_score": a.z_score,
                "timestamp": str(a.timestamp),
            }
            for a in alerts
        ]

    async def _fetch_price_changes(self, snapshot: dict) -> dict[str, float | None]:
        """
        Compute 7-day price change for each held symbol.

        Returns {symbol: pct_change} where pct_change is e.g. -0.023 for -2.3%.
        Returns None for a symbol if there is not enough data.
        """
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=7)
        changes: dict[str, float | None] = {}

        for pos in snapshot.get("positions", []):
            symbol: str = pos["symbol"]
            provider: str = pos["provider"]

            # Latest price
            latest_row = await self._db.execute(
                select(PricePoint.price)
                .where(PricePoint.symbol == symbol, PricePoint.provider == provider)
                .order_by(desc(PricePoint.timestamp))
                .limit(1)
            )
            latest = latest_row.scalar_one_or_none()

            # Oldest price within the 7-day window
            oldest_row = await self._db.execute(
                select(PricePoint.price)
                .where(
                    PricePoint.symbol == symbol,
                    PricePoint.provider == provider,
                    PricePoint.timestamp >= cutoff,
                )
                .order_by(PricePoint.timestamp.asc())
                .limit(1)
            )
            oldest = oldest_row.scalar_one_or_none()

            if latest is not None and oldest is not None and float(oldest) != 0:
                changes[symbol] = round((float(latest) - float(oldest)) / float(oldest), 6)
            else:
                changes[symbol] = None

        return changes

    # ------------------------------------------------------------------
    # Claude call
    # ------------------------------------------------------------------

    async def _call_claude(self, prompt: str) -> str:
        result = await self._client.complete(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
        )
        return result.text or ""

    def _parse_response(self, raw: str, portfolio_id: UUID) -> dict:
        """
        Parse Claude's JSON response.

        Falls back gracefully if Claude returns non-JSON — wraps raw text
        in the expected schema so callers always get the same shape.
        """
        try:
            parsed = json.loads(raw)
            parsed["portfolio_id"] = str(portfolio_id)
            return parsed
        except json.JSONDecodeError:
            logger.warning(f"[Intelligence] Claude returned non-JSON for portfolio {portfolio_id}")
            return {
                "portfolio_id": str(portfolio_id),
                "regime": "unknown",
                "risks": [],
                "recommendations": [],
                "alert_explanations": [],
                "narrative": raw,
            }
