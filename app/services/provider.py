import httpx
import logging
import asyncio
from datetime import datetime
from fastapi import HTTPException, status
from app.core.config import settings
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.raw_market_data import RawMarketData
from uuid import uuid4
import json
from app.kafka.producer import send_price_event
from app.core.redis import redis_client
from app.models.price_points import PricePoint
from datetime import timedelta

logger = logging.getLogger(__name__)
# need to create a provider interface to swap sources easily(generalised service for all 3 providers).
ALPHA_VANTAGE_URL= "https://www.alphavantage.co/query"

async def get_latest_prices(symbol: str, provider: str, db: Session, include_raw_id: bool = False, send_event_to_kafka: bool = False) -> dict:
    cache_key = f"{symbol.lower()}:alpha_vantage"

    cached = redis_client.get(cache_key)
    if cached:
        logger.info(f"[CACHE HIT] Returning cached result for {symbol}")
        return json.loads(cached)
    
    freshness_window = timedelta(seconds=settings.db_price_ttl or 60)
    
    latest = db.query(PricePoint).filter(
            PricePoint.symbol == symbol,
            PricePoint.provider == provider,
            PricePoint.timestamp >= datetime.utcnow() - freshness_window
        ).order_by(PricePoint.timestamp.desc()).first()
    
    if latest:
        logger.info(f"[DB HIT] Returning recent DB entry for {symbol}")

        result = {
            "symbol": symbol,
            "price": latest.price,
            "timestamp": latest.timestamp.isoformat(),
            "provider": provider
        }
        redis_client.setex(cache_key, 60, json.dumps(result))
        logger.info(f"[CACHE SET] {symbol} populated from DB")
        return result
    
    # if not in Db and Cache then fetch from provider API

    vantage_params = {
        "function": "TIME_SERIES_INTRADAY",
        "symbol": symbol,
        "interval": "1min",
        "apikey": settings.alpha_vantage_api_key
    }

    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(ALPHA_VANTAGE_URL, params=vantage_params)
                response.raise_for_status()
                data = response.json()
                break

        except Exception as e:
            logger.warning(f"[API RETRY] Attempt {attempt+1} failed for {symbol}")
            if attempt == 2:
                raise HTTPException(status_code=503, detail="Alpha Vantage provider unavailable")
            await asyncio.sleep(2 ** attempt)
        
    if "Time Series (1min)" not in data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=" Symbol not found or API limit exceeded")
    
    try:
        time_series_data = data["Time Series (1min)"]
        latest_timestamp = max(time_series_data.keys())
        latest_data = time_series_data[latest_timestamp]
        price = float(latest_data["4. close"])
        timestamp = datetime.strptime(latest_timestamp, "%Y-%m-%d %H:%M:%S")
    except:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to parse API response")
    
    # storing raw API response
    raw_market_data_entry = RawMarketData(
        id=uuid4(),
        symbol=symbol,
        provider=provider,
        raw_json=json.dumps(data),
        timestamp=datetime.utcnow()
    )
    db.add(raw_market_data_entry)
    db.commit()
    db.refresh(raw_market_data_entry)

    result = {
        "symbol": symbol,
        "price": price,
        "timestamp": timestamp.isoformat(),
        "provider": provider
    }

    if include_raw_id:
        result["raw_data_id"] = str(raw_market_data_entry.id)

    # Send the event to Kafka
    
    if send_event_to_kafka:
        try:
            await send_price_event(
                symbol=symbol,
                price=price,
                timestamp=timestamp.isoformat(),
                provider=provider,
                raw_response_id=str(raw_market_data_entry.id)
            )
            logger.info(f"[KAFKA] Event sent for {symbol}")
        except Exception as e:
            logger.error(f"[KAFKA ERROR] Failed to send event: {e}")

    # Cache result
    
    redis_client.setex(cache_key, 60, json.dumps(result))
    print(f"[CACHE SET] {symbol} stored in Redis")
    
    return result