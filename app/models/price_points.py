from app.database.base import Base
from sqlalchemy import Column, String, Text, UUID, DateTime, func, Float, ForeignKey
from uuid import uuid4

class PricePoint(Base):
    __tablename__= "price_points"

    id = Column(UUID(as_uuid=True), default=uuid4, nullable=False, primary_key=True)
    symbol = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    provider = Column(String, nullable=False)
    raw_data_id = Column(UUID(as_uuid=True), ForeignKey("raw_market_data.id"))