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
FINNHUB_URL = "https://finnhub.io/api/v1/quote"


async def get_latest_prices(symbol: str, provider: str, db: Session, include_raw_id: bool = False, send_event_to_kafka: bool = False) -> dict:
    cache_key = f"{symbol.lower()}:{provider}"
    freshness_window = timedelta(seconds=settings.db_price_ttl or 60)
    cached = redis_client.get(cache_key)
    if cached:
        cached_data = json.loads(cached)
    
        # Check if cached data is still fresh (timestamp comparison)
        cached_time = datetime.fromisoformat(cached_data['timestamp'])
        if datetime.utcnow() - cached_time < freshness_window:
            logger.info(f"[CACHE HIT] Returning fresh cached result for {symbol}")
            return cached_data
        else:
            logger.info(f"[CACHE STALE] Ignoring stale cache for {symbol}")
    
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

    for attempt in range(3):
        try:
            async with httpx.AsyncClient() as client:
                if provider == "finnhub":
                    response = await client.get(FINNHUB_URL, params={
                        "symbol": symbol,
                        "token": settings.finnhub_api_key
                    })
                    response.raise_for_status()
                    data = response.json()
                    logger.info(f"[FINNHUB RESPONSE] {data}")


                    if "c" not in data:
                        raise HTTPException(status_code=404, detail="Symbol not found or invalid response from Finnhub")

                    price = float(data["c"])
                    timestamp = datetime.utcfromtimestamp(data["t"])

                elif provider == "alpha_vantage":
                    vantage_params = {
                        "function": "TIME_SERIES_INTRADAY",
                        "symbol": symbol,
                        "interval": "1min",
                        "apikey": settings.alpha_vantage_api_key
                    }
                    response = await client.get(ALPHA_VANTAGE_URL, params=vantage_params)
                    response.raise_for_status()
                    data = response.json()

                    if "Time Series (1min)" not in data:
                        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                            detail="Symbol not found or API limit exceeded")

                    time_series_data = data["Time Series (1min)"]
                    latest_timestamp = max(time_series_data.keys())
                    latest_data = time_series_data[latest_timestamp]
                    price = float(latest_data["4. close"])
                    timestamp = datetime.strptime(latest_timestamp, "%Y-%m-%d %H:%M:%S")
                else:
                    raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
                break

        except Exception as e:
            logger.warning(f"[API RETRY] Attempt {attempt+1} failed for {symbol} with provider {provider}")
            if attempt == 2:
                raise HTTPException(status_code=503, detail=f"{provider} provider unavailable")
            await asyncio.sleep(2 ** attempt)


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
    
    if not include_raw_id:
        price_point_entry = PricePoint(
            symbol=symbol,
            provider=provider,
            price=price,
            timestamp=timestamp,
            raw_data_id=raw_market_data_entry.id  
        )
        db.add(price_point_entry)
        db.commit()
        logger.info(f"[DB] Stored price point for {symbol} at {timestamp}")

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