"""
Prompt builders for Claude portfolio intelligence.

Kept in a dedicated module so prompt text is versioned and tested independently
from the services that call Claude.
"""
import json
from typing import Any


def build_analysis_prompt(
    snapshot: dict[str, Any],
    risk: dict[str, Any],
    indicators_by_symbol: dict[str, Any],
    alerts: list[dict[str, Any]],
    price_changes: dict[str, float],
) -> str:
    """
    Build the full-portfolio analysis prompt.

    price_changes: {symbol: pct_change_7d} — e.g. {"AAPL": -0.023, "NVDA": 0.051}
    """
    return (
        "You are a quantitative portfolio analyst. Respond ONLY with valid JSON — "
        "no markdown, no prose outside the JSON object.\n\n"
        "Given the following portfolio data:\n\n"
        f"Portfolio snapshot:\n{json.dumps(snapshot, default=str, indent=2)}\n\n"
        f"Risk metrics:\n{json.dumps(risk, default=str, indent=2)}\n\n"
        f"Technical indicators per symbol:\n{json.dumps(indicators_by_symbol, default=str, indent=2)}\n\n"
        f"Active anomaly alerts:\n{json.dumps(alerts, default=str, indent=2)}\n\n"
        f"7-day price changes:\n{json.dumps(price_changes, default=str, indent=2)}\n\n"
        "Provide a JSON object with exactly these keys:\n"
        '  "regime": one of "risk-on", "risk-off", "neutral" — 3-sentence market regime assessment\n'
        '  "risks": array of 2-3 strings — top portfolio risks citing specific metrics\n'
        '  "recommendations": array of strings — at least one concrete rebalancing suggestion with quantitative reasoning\n'
        '  "alert_explanations": array of strings — plain-English explanation of each active alert (empty array if none)\n'
        '  "narrative": string — the 3-sentence regime assessment in full prose\n\n'
        "Be direct and factual. Do not speculate beyond what the data shows."
    )


def build_qa_system_prompt() -> str:
    """
    System prompt for the Q&A service.

    Instructs Claude to use the available tools to fetch data rather than
    guessing, and to answer in plain English.
    """
    return (
        "You are a quantitative portfolio analyst with access to real-time market data tools. "
        "When answering questions about a portfolio or specific symbols, use the available tools "
        "to fetch current price history, technical indicators, and correlations from the database "
        "rather than guessing. "
        "Be concise and data-driven. Cite specific numbers from the data you retrieve. "
        "Do not speculate beyond what the data shows. "
        "If the data is insufficient to answer confidently, say so explicitly."
    )


def build_qa_user_prompt(question: str, portfolio_context: dict[str, Any]) -> str:
    """
    User-turn prompt for Q&A.  Includes the portfolio snapshot as baseline context
    so Claude can decide which tools to call for deeper data.
    """
    return (
        f"Portfolio context:\n{json.dumps(portfolio_context, default=str, indent=2)}\n\n"
        f"Question: {question}"
    )
