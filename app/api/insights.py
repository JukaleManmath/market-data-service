import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis_client
from app.database.session import get_async_db
from app.models.alerts import Alert
from app.services.ai_insights import AIInsightsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["AI Insights"])


@router.get("/{symbol}")
async def get_symbol_insights(
    symbol: str,
    provider: str = "finnhub",
    db: AsyncSession = Depends(get_async_db),
) -> dict:
    """
    Return a Claude-generated plain-English summary of recent anomaly alerts
    for the given symbol. Results are cached in Redis for 5 minutes.
    """
    result = await db.execute(
        select(Alert)
        .where(Alert.symbol == symbol, Alert.provider == provider)
        .order_by(Alert.timestamp.desc())
        .limit(10)
    )
    alerts = result.scalars().all()

    alerts_as_dicts = [
        {
            "anomaly_type": a.anomaly_type,
            "severity": a.severity,
            "price": a.price,
            "z_score": a.z_score,
            "fast_ma": a.fast_ma,
            "slow_ma": a.slow_ma,
            "timestamp": str(a.timestamp),
            "resolved": a.resolved,
        }
        for a in alerts
    ]

    service = AIInsightsService(cache=redis_client)
    summary = await service.get_summary(symbol, provider, alerts_as_dicts)

    return {"symbol": symbol, "provider": provider, "summary": summary}
