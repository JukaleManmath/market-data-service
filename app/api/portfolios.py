import logging
from uuid import UUID

from anthropic import APIError as AnthropicAPIError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import redis_client
from app.database.session import get_async_db
from app.schemas.portfolio import (
    AddPositionRequest,
    AskQuestionRequest,
    AskQuestionResponse,
    CreatePortfolioRequest,
    PortfolioAnalysisResponse,
    PortfolioResponse,
    PortfolioSnapshot,
    PositionResponse,
)
from app.services.market_qa import MarketQAService
from app.services.portfolio_intelligence import PortfolioIntelligenceService
from app.services.portfolio_service import PortfolioService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolios", tags=["Portfolios"])


def _service(db: AsyncSession = Depends(get_async_db)) -> PortfolioService:
    return PortfolioService(db=db, cache=redis_client)


@router.post("", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
async def create_portfolio(
    body: CreatePortfolioRequest,
    service: PortfolioService = Depends(_service),
) -> PortfolioResponse:
    portfolio = await service.create_portfolio(name=body.name, portfolio_type=body.portfolio_type)
    return portfolio


@router.post(
    "/{portfolio_id}/positions",
    response_model=PositionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_position(
    portfolio_id: UUID,
    body: AddPositionRequest,
    service: PortfolioService = Depends(_service),
) -> PositionResponse:
    try:
        position = await service.add_or_update_position(
            portfolio_id=portfolio_id,
            symbol=body.symbol.upper(),
            quantity=body.quantity,
            price=body.price,
            provider=body.provider,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return position


@router.delete(
    "/{portfolio_id}/positions/{position_id}",
    response_model=PositionResponse,
)
async def close_position(
    portfolio_id: UUID,
    position_id: UUID,
    service: PortfolioService = Depends(_service),
) -> PositionResponse:
    try:
        position = await service.close_position(
            portfolio_id=portfolio_id,
            position_id=position_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return position


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio(
    portfolio_id: UUID,
    service: PortfolioService = Depends(_service),
) -> None:
    try:
        await service.delete_portfolio(portfolio_id=portfolio_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{portfolio_id}/snapshot", response_model=PortfolioSnapshot)
async def get_snapshot(
    portfolio_id: UUID,
    service: PortfolioService = Depends(_service),
) -> PortfolioSnapshot:
    try:
        snapshot = await service.get_snapshot(portfolio_id=portfolio_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return snapshot


@router.get("/{portfolio_id}/analysis", response_model=PortfolioAnalysisResponse)
async def get_portfolio_analysis(
    portfolio_id: UUID,
    db: AsyncSession = Depends(get_async_db),
) -> PortfolioAnalysisResponse:
    """
    Claude full portfolio analysis.

    Gathers snapshot, risk metrics, technical indicators, active alerts, and
    7-day price changes, then returns a structured Claude analyst report:
    market regime, top risks, rebalancing recommendations, alert explanations.

    Cached in Redis for 5 minutes.
    """
    try:
        svc = PortfolioIntelligenceService(db=db, cache=redis_client)
        result = await svc.analyze(portfolio_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AnthropicAPIError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Claude API error: {e}")
    return PortfolioAnalysisResponse(**result)


@router.post("/{portfolio_id}/ask", response_model=AskQuestionResponse)
async def ask_portfolio_question(
    portfolio_id: UUID,
    body: AskQuestionRequest,
    db: AsyncSession = Depends(get_async_db),
) -> AskQuestionResponse:
    """
    Natural language Q&A about the portfolio.

    Claude uses tool use to actively fetch price history, technical indicators,
    and correlations from the database to answer the question.

    Cached per (portfolio_id, question) for 2 minutes.
    """
    try:
        svc = MarketQAService(db=db, cache=redis_client)
        result = await svc.ask(portfolio_id, body.question)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AnthropicAPIError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Claude API error: {e}")
    return AskQuestionResponse(**result)
