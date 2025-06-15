from fastapi import APIRouter, status, Depends
from app.schemas.price import PriceResponse
from datetime import datetime
from app.services.provider import get_latest_prices
from sqlalchemy.orm import Session
from app.database.session import get_db

router = APIRouter(prefix="/prices", tags=["Fetching Latest Price"])

@router.get("/latest",status_code=status.HTTP_200_OK, response_model=PriceResponse)
async def get_latest_price(symbol: str, provider: str | None = "alpha_vantage", db: Session = Depends(get_db)):
    latest_price_response = await get_latest_prices(symbol,provider,db,send_event_to_kafka=True)
    return latest_price_response
