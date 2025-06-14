from fastapi import APIRouter
from app.schemas.price import PriceResponse
from datetime import datetime
from app.services.provider import get_latest_prices

router = APIRouter(prefix="/prices")

@router.get("/latest", response_model=PriceResponse)
async def get_latest_price(symbol: str, provider: str | None = "alpha_vantage"):
    latest_price_response = await get_latest_prices(symbol)
    return latest_price_response
