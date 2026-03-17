from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.redis import redis_client
from app.database.session import get_db
from app.schemas.price import PriceResponse
from app.services.price_service import PriceService
from app.services.providers.registry import get_provider

router = APIRouter(prefix="/prices", tags=["Prices"])


@router.get("/latest", status_code=status.HTTP_200_OK, response_model=PriceResponse)
async def get_latest_price(
    symbol: str,
    provider: str = "finnhub",
    db: Session = Depends(get_db),
):
    service = PriceService(
        provider=get_provider(provider),
        db=db,
        cache=redis_client,
    )
    return await service.get_latest_price(symbol, publish_to_kafka=True)
