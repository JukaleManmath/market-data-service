from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------

class CreatePortfolioRequest(BaseModel):
    name: str


class PortfolioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Position
# ---------------------------------------------------------------------------

class AddPositionRequest(BaseModel):
    symbol: str
    quantity: float = Field(gt=0)
    price: float = Field(gt=0, description="Price per share you are buying at")
    provider: str = "finnhub"


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    portfolio_id: UUID
    symbol: str
    provider: str
    quantity: float
    avg_cost_basis: float
    is_active: bool
    opened_at: datetime
    closed_at: datetime | None


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------

class PositionSnapshot(BaseModel):
    position_id: UUID
    symbol: str
    provider: str
    quantity: float
    avg_cost_basis: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    pnl_pct: float
    weight: float


class PortfolioSnapshot(BaseModel):
    portfolio_id: UUID
    portfolio_name: str
    total_value: float
    total_pnl: float
    positions: list[PositionSnapshot]


# ---------------------------------------------------------------------------
# Phase 8 — Claude intelligence
# ---------------------------------------------------------------------------

class PortfolioAnalysisResponse(BaseModel):
    portfolio_id: str
    regime: str                       # "risk-on" | "risk-off" | "neutral" | "unknown"
    risks: list[str]                  # top 2-3 risks citing specific metrics
    recommendations: list[str]        # rebalancing suggestions with quantitative reasoning
    alert_explanations: list[str]     # plain-English explanation of each active alert
    narrative: str                    # 3-sentence regime assessment in full prose
    cached: bool


class AskQuestionRequest(BaseModel):
    question: str


class AskQuestionResponse(BaseModel):
    question: str
    answer: str
    cached: bool
