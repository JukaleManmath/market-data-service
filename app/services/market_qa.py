"""
Natural language Q&A service for portfolio questions.

Uses Claude tool use so Claude actively fetches the data it needs
(price history, indicators, correlations) rather than reading a static snapshot.

Cache key: portfolio_analysis_qa:{portfolio_id}:{hash(question)}
TTL: 2 minutes
"""
import hashlib
import json
import logging
from uuid import UUID

import numpy as np
from redis.asyncio import Redis
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.llm_client import get_llm_client
from app.models.price_points import PricePoint
from app.prompts.portfolio_analysis import build_qa_system_prompt, build_qa_user_prompt
from app.services.signal_generator import SignalGenerator
from app.services.technical_analysis import TechnicalAnalysisService

logger = logging.getLogger(__name__)

CACHE_TTL = 120  # 2 minutes

# ---------------------------------------------------------------------------
# Tool definitions sent to Claude
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "get_price_history",
        "description": (
            "Fetch recent closing prices for a symbol from the database. "
            "Returns a list of floats ordered oldest to newest."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Ticker symbol, e.g. AAPL"},
                "provider": {"type": "string", "description": "Data provider, e.g. finnhub", "default": "finnhub"},
                "days": {"type": "integer", "description": "Number of most recent price points to return", "default": 30},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_technical_indicators",
        "description": (
            "Compute RSI, MACD, and Bollinger Bands for a symbol. "
            "Returns null for indicators that require more data than is available."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Ticker symbol, e.g. AAPL"},
                "provider": {"type": "string", "description": "Data provider, e.g. finnhub", "default": "finnhub"},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_correlation",
        "description": (
            "Compute the Pearson correlation coefficient between the price returns "
            "of two symbols over the last 60 price points. "
            "Returns a float between -1 and 1."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol_a": {"type": "string", "description": "First ticker symbol"},
                "symbol_b": {"type": "string", "description": "Second ticker symbol"},
                "provider": {"type": "string", "description": "Data provider for both symbols", "default": "finnhub"},
            },
            "required": ["symbol_a", "symbol_b"],
        },
    },
]


class MarketQAService:
    """
    Natural language Q&A backed by Claude tool use.

    Claude decides which tools to call to fetch the data it needs, then
    synthesises a plain-English answer.
    """

    def __init__(self, db: AsyncSession, cache: Redis, llm_provider: str | None = None) -> None:
        self._db = db
        self._cache = cache
        self._client = get_llm_client(provider=llm_provider)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def ask(self, portfolio_id: UUID, question: str) -> dict:
        """
        Answer a natural language question about the portfolio.

        Cache key encodes both the portfolio_id and the question so different
        portfolios get separate answers for the same question.
        """
        cache_key = self._cache_key(portfolio_id, question)
        cached = await self._cache.get(cache_key)
        if cached:
            logger.info(f"[QA] Cache hit for portfolio {portfolio_id}")
            result = json.loads(cached)
            result["cached"] = True
            return result

        logger.info(f"[QA] Answering question for portfolio {portfolio_id}: {question!r}")
        portfolio_context = await self._fetch_portfolio_context(portfolio_id)

        answer = await self._run_tool_loop(question, portfolio_context)

        result = {"question": question, "answer": answer}
        await self._cache.setex(cache_key, CACHE_TTL, json.dumps(result))
        logger.info(f"[QA] Answer cached (TTL={CACHE_TTL}s)")

        result["cached"] = False
        return result

    # ------------------------------------------------------------------
    # Agentic tool loop
    # ------------------------------------------------------------------

    async def _run_tool_loop(self, question: str, portfolio_context: dict) -> str:
        """
        Provider-agnostic tool-use loop:
          1. Send question + tools to the LLM client
          2. If the response contains tool calls, execute them
          3. Append tool results in the provider's expected format and repeat
          4. Stop when the client signals done (no more tool calls)
        """
        messages = [
            {
                "role": "user",
                "content": build_qa_user_prompt(question, portfolio_context),
            }
        ]
        system = build_qa_system_prompt()

        while True:
            result = await self._client.complete(
                messages=messages,
                system=system,
                max_tokens=1024,
                tools=TOOLS,
            )

            messages.append(result.assistant_message)

            if result.done:
                return result.text or ""

            if not result.tool_calls:
                break

            tool_results: list[tuple[str, object]] = []
            for tc in result.tool_calls:
                output = await self._dispatch_tool(tc.name, tc.input)
                logger.info(f"[QA] Tool called: {tc.name}({tc.input})")
                tool_results.append((tc.id, output))

            messages.extend(self._client.make_tool_result_messages(tool_results))

        return "Unable to generate an answer."

    # ------------------------------------------------------------------
    # Tool implementations
    # ------------------------------------------------------------------

    async def _dispatch_tool(self, name: str, inputs: dict) -> object:
        if name == "get_price_history":
            return await self._tool_get_price_history(**inputs)
        if name == "get_technical_indicators":
            return await self._tool_get_technical_indicators(**inputs)
        if name == "get_correlation":
            return await self._tool_get_correlation(**inputs)
        return {"error": f"Unknown tool: {name}"}

    async def _tool_get_price_history(
        self,
        symbol: str,
        provider: str = "finnhub",
        days: int = 30,
    ) -> list[float]:
        result = await self._db.execute(
            select(PricePoint.price)
            .where(PricePoint.symbol == symbol.upper(), PricePoint.provider == provider)
            .order_by(desc(PricePoint.timestamp))
            .limit(days)
        )
        rows = result.scalars().all()
        return list(reversed([float(p) for p in rows]))

    async def _tool_get_technical_indicators(
        self,
        symbol: str,
        provider: str = "finnhub",
    ) -> dict:
        ta = TechnicalAnalysisService(self._db)
        indicators = await ta.compute(symbol.upper(), provider)

        result = await self._db.execute(
            select(PricePoint.price)
            .where(PricePoint.symbol == symbol.upper(), PricePoint.provider == provider)
            .order_by(desc(PricePoint.timestamp))
            .limit(1)
        )
        current_price = float(result.scalar_one_or_none() or 0.0)

        signal = SignalGenerator().generate(indicators, current_price)

        return {
            "symbol": symbol.upper(),
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
                    "bandwidth": indicators.bollinger.bandwidth,
                }
                if indicators.bollinger
                else None
            ),
            "signal": signal.signal.value,
            "confidence": signal.confidence,
            "price_count": indicators.price_count,
        }

    async def _tool_get_correlation(
        self,
        symbol_a: str,
        symbol_b: str,
        provider: str = "finnhub",
    ) -> dict:
        async def _prices(sym: str) -> list[float]:
            result = await self._db.execute(
                select(PricePoint.price)
                .where(PricePoint.symbol == sym.upper(), PricePoint.provider == provider)
                .order_by(desc(PricePoint.timestamp))
                .limit(60)
            )
            rows = result.scalars().all()
            return list(reversed([float(p) for p in rows]))

        prices_a = await _prices(symbol_a)
        prices_b = await _prices(symbol_b)

        min_len = min(len(prices_a), len(prices_b))
        if min_len < 2:
            return {
                "symbol_a": symbol_a.upper(),
                "symbol_b": symbol_b.upper(),
                "correlation": None,
                "warning": "Insufficient data to compute correlation",
            }

        arr_a = np.array(prices_a[-min_len:])
        arr_b = np.array(prices_b[-min_len:])
        returns_a = np.diff(np.log(arr_a))
        returns_b = np.diff(np.log(arr_b))

        corr = float(np.corrcoef(returns_a, returns_b)[0, 1])

        return {
            "symbol_a": symbol_a.upper(),
            "symbol_b": symbol_b.upper(),
            "correlation": round(corr, 4),
            "data_points": min_len,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _fetch_portfolio_context(self, portfolio_id: UUID) -> dict:
        """Minimal snapshot context sent with every question as baseline."""
        from app.services.portfolio_service import PortfolioService

        svc = PortfolioService(db=self._db, cache=self._cache)
        snap = await svc.get_snapshot(portfolio_id)
        return {
            "portfolio_id": str(portfolio_id),
            "portfolio_name": snap.portfolio_name,
            "total_value": snap.total_value,
            "total_pnl": snap.total_pnl,
            "positions": [
                {
                    "symbol": p.symbol,
                    "provider": p.provider,
                    "quantity": p.quantity,
                    "avg_cost_basis": p.avg_cost_basis,
                    "current_price": p.current_price,
                    "unrealized_pnl": p.unrealized_pnl,
                    "pnl_pct": p.pnl_pct,
                    "weight": p.weight,
                }
                for p in snap.positions
            ],
        }

    @staticmethod
    def _cache_key(portfolio_id: UUID, question: str) -> str:
        q_hash = hashlib.sha256(question.encode()).hexdigest()[:16]
        return f"portfolio_qa:{portfolio_id}:{q_hash}"
