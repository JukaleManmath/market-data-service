"""
LLM client abstraction.

Supports Claude (via Anthropic SDK) and Ollama (via its native /api/chat REST endpoint).
Switch providers by setting LLM_PROVIDER=ollama in .env.

Design rules:
- Both clients expose the same interface: complete() + make_tool_result_messages()
- CompletionResult normalises the response so callers don't branch on provider
- Tool schemas are defined once in Claude format; _to_ollama_tool() converts them
"""
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx
from anthropic import AsyncAnthropic
from anthropic.types import ToolUseBlock

logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict


@dataclass
class CompletionResult:
    text: str | None
    done: bool                              # True  → final answer, no more tool calls
    tool_calls: list[ToolCall] = field(default_factory=list)
    assistant_message: dict = field(default_factory=dict)  # ready to append to history


class BaseLLMClient(ABC):
    @abstractmethod
    async def complete(
        self,
        messages: list[dict],
        system: str | None = None,
        max_tokens: int = 512,
        tools: list[dict] | None = None,
    ) -> CompletionResult: ...

    @abstractmethod
    def make_tool_result_messages(self, results: list[tuple[str, Any]]) -> list[dict]:
        """Convert [(tool_id, output), ...] into provider-specific history messages."""
        ...


# ---------------------------------------------------------------------------
# Claude
# ---------------------------------------------------------------------------

class ClaudeClient(BaseLLMClient):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def complete(
        self,
        messages: list[dict],
        system: str | None = None,
        max_tokens: int = 512,
        tools: list[dict] | None = None,
    ) -> CompletionResult:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        response = await self._client.messages.create(**kwargs)

        text = next((b.text for b in response.content if hasattr(b, "text")), None)
        done = response.stop_reason == "end_turn"
        tool_calls = [
            ToolCall(id=b.id, name=b.name, input=b.input)
            for b in response.content
            if isinstance(b, ToolUseBlock)
        ]
        return CompletionResult(
            text=text,
            done=done,
            tool_calls=tool_calls,
            assistant_message={"role": "assistant", "content": response.content},
        )

    def make_tool_result_messages(self, results: list[tuple[str, Any]]) -> list[dict]:
        # Claude expects all tool results in one user message
        return [
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": json.dumps(output, default=str),
                    }
                    for tool_id, output in results
                ],
            }
        ]


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------

class OllamaClient(BaseLLMClient):
    def __init__(self, base_url: str, model: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model

    async def complete(
        self,
        messages: list[dict],
        system: str | None = None,
        max_tokens: int = 512,
        tools: list[dict] | None = None,
    ) -> CompletionResult:
        msgs = list(messages)
        if system:
            msgs = [{"role": "system", "content": system}] + msgs

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": msgs,
            "stream": False,
            "options": {"num_predict": max_tokens},
        }
        if tools:
            payload["tools"] = [_to_ollama_tool(t) for t in tools]

        async with httpx.AsyncClient(timeout=120.0) as http:
            resp = await http.post(f"{self._base_url}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()

        msg = data.get("message", {})
        content: str = msg.get("content", "") or ""
        raw_tool_calls: list[dict] = msg.get("tool_calls", []) or []

        tool_calls = [
            ToolCall(
                id=f"call_{i}",
                name=tc["function"]["name"],
                input=tc["function"].get("arguments", {}),
            )
            for i, tc in enumerate(raw_tool_calls)
        ]

        done = len(tool_calls) == 0
        assistant_message: dict[str, Any] = {"role": "assistant", "content": content}
        if raw_tool_calls:
            assistant_message["tool_calls"] = raw_tool_calls

        return CompletionResult(
            text=content if done else None,
            done=done,
            tool_calls=tool_calls,
            assistant_message=assistant_message,
        )

    def make_tool_result_messages(self, results: list[tuple[str, Any]]) -> list[dict]:
        # Ollama expects one tool message per result
        return [
            {"role": "tool", "content": json.dumps(output, default=str)}
            for _, output in results
        ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_ollama_tool(claude_tool: dict) -> dict:
    """Convert Claude tool schema (input_schema) to Ollama function tool format."""
    return {
        "type": "function",
        "function": {
            "name": claude_tool["name"],
            "description": claude_tool.get("description", ""),
            "parameters": claude_tool.get("input_schema", {}),
        },
    }


def get_llm_client(provider: str | None = None) -> BaseLLMClient:
    """
    Factory — returns the configured LLM client.

    provider overrides the LLM_PROVIDER env setting for this request only.
    Pass None to use the server default.
    """
    from app.core.config import settings

    effective = provider or settings.llm_provider

    if effective == "ollama":
        logger.info(
            f"[LLM] Provider: Ollama  model={settings.ollama_model}  url={settings.ollama_base_url}"
        )
        return OllamaClient(base_url=settings.ollama_base_url, model=settings.ollama_model)

    logger.info("[LLM] Provider: Claude (claude-sonnet-4-6)")
    return ClaudeClient(api_key=settings.anthropic_api_key)
