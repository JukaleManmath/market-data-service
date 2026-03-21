import json
import logging

from anthropic import AsyncAnthropic
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes


class AIInsightsService:
    """
    Generates Claude-powered plain-English summaries for a symbol's anomaly alerts.

    Uses AsyncAnthropic — never the sync client, which blocks the event loop.
    Results are cached in Redis for CACHE_TTL seconds to avoid redundant API calls.

    Cache is injected at construction time (Dependency Inversion), consistent
    with how PriceService receives its dependencies.
    """

    def __init__(self, cache: Redis) -> None:
        self.cache = cache
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def get_summary(self, symbol: str, provider: str, alerts: list[dict]) -> str:
        """
        Return a 2–3 sentence analyst summary for the given symbol's recent alerts.

        Checks Redis first. On miss, calls Claude claude-sonnet-4-6 and caches the result.
        If alerts is empty, returns a no-anomaly message without calling Claude.
        """
        if not alerts:
            return f"No anomalies detected for {symbol} ({provider}) yet."

        cache_key = f"insights:{symbol.lower()}:{provider}"
        cached = await self.cache.get(cache_key)
        if cached:
            logger.info(f"[AIInsights] Cache hit for {symbol}")
            return cached.decode() if isinstance(cached, bytes) else cached

        prompt = self._build_prompt(symbol, provider, alerts)
        logger.info(f"[AIInsights] Calling Claude for {symbol} ({len(alerts)} alerts)")

        response = await self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        summary = response.content[0].text

        await self.cache.setex(cache_key, CACHE_TTL, summary)
        logger.info(f"[AIInsights] Summary cached for {symbol} (TTL={CACHE_TTL}s)")

        return summary

    def _build_prompt(self, symbol: str, provider: str, alerts: list[dict]) -> str:
        return (
            f"You are a quantitative analyst assistant. Summarize the following anomaly alerts "
            f"for {symbol} (provider: {provider}) in 2-3 sentences. Be direct and factual.\n\n"
            f"Alerts:\n{json.dumps(alerts, default=str, indent=2)}\n\n"
            f"Focus on: what was detected, potential market implication, and a one-line suggested action. "
            f"Do not speculate beyond what the data shows."
        )
