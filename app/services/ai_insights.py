import json
import logging

from redis.asyncio import Redis

from app.core.llm_client import get_llm_client

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes


class AIInsightsService:
    """
    Generates LLM-powered plain-English summaries for a symbol's anomaly alerts.

    Uses the configured LLM client (Claude or Ollama). Results are cached in Redis
    for CACHE_TTL seconds to avoid redundant API calls.
    """

    def __init__(self, cache: Redis, llm_provider: str | None = None) -> None:
        self.cache = cache
        self._client = get_llm_client(provider=llm_provider)

    async def get_summary(self, symbol: str, provider: str, alerts: list[dict]) -> str:
        if not alerts:
            return f"No anomalies detected for {symbol} ({provider}) yet."

        cache_key = f"insights:{symbol.lower()}:{provider}"
        cached = await self.cache.get(cache_key)
        if cached:
            logger.info(f"[AIInsights] Cache hit for {symbol}")
            return cached.decode() if isinstance(cached, bytes) else cached

        prompt = self._build_prompt(symbol, provider, alerts)
        logger.info(f"[AIInsights] Calling LLM for {symbol} ({len(alerts)} alerts)")

        result = await self._client.complete(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
        )
        summary = result.text or ""

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
