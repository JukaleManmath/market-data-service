import httpx
from datetime import datetime
from fastapi import HTTPException, status
from app.core.config import settings

# need to create a provider interface to swap sources easily(generalised service for all 3 providers).
ALPHA_VANTAGE_URL= "https://www.alphavantage.co/query"

async def get_latest_prices(symbol: str) -> dict:
    vantage_params = {
        "function": "TIME_SERIES_INTRADAY",
        "symbol": symbol,
        "interval": "1min",
        "apikey": settings.alpha_vantage_api_key
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(ALPHA_VANTAGE_URL, params=vantage_params)
            response.raise_for_status()
            data = response.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Alpha Vantage provider unavailable")
    
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
    
    return {
        "symbol": symbol,
        "price": price,
        "timestamp": timestamp,
        "provider": "alpha_vantage"
    }
