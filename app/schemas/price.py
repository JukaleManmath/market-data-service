from pydantic import BaseModel
from datetime import datetime

class PriceResponse(BaseModel):
    symbol: str
    price: float
    timestamp: datetime
    provider: str

