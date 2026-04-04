import logging

import httpx
from anthropic import APIError as AnthropicAPIError
from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    llm_provider: str | None = Query(default=None),
    db: AsyncSession = Depends(get_async_db),
) -> dict:
    """
    Return a plain-English summary of recent anomaly alerts for the given symbol.
    Results are cached in Redis for 5 minutes.

    Pass llm_provider=ollama to use a local Ollama model instead of Claude.
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

    service = AIInsightsService(cache=redis_client, llm_provider=llm_provider)
    try:
        summary = await service.get_summary(symbol, provider, alerts_as_dicts)
    except AnthropicAPIError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Claude API error: {e}")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Ollama error: {e}")

    return {"symbol": symbol, "provider": provider, "summary": summary}
