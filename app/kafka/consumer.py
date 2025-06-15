from confluent_kafka import Consumer, KafkaException
import json
import logging
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.models.price_points import PricePoint
from app.models.moving_average import MovingAverage
from datetime import datetime

conf = {
    'bootstrap.servers': 'localhost:9092',
    'group.id': 'ma-consumer-group',
    'auto.offset.reset': 'earliest'
}

consumer = Consumer(conf)
consumer.subscribe(['price-events'])

print("MA Consumer started and listening...")

def compute_moving_average(symbol: str, db: Session):
    rows = db.query(PricePoint).filter_by(symbol=symbol).order_by(PricePoint.timestamp.desc()).limit(5).all()
    if len(rows) == 5:
        avg_price = sum(r.price for r in rows) / 5
        ma = MovingAverage(
            symbol=symbol,
            average_price=avg_price,
            interval=5,
            provider="alpha_vantage",
            timestamp=datetime.utcnow()
        )
        db.add(ma)
        db.commit()

while True:
    try:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            raise KafkaException(msg.error())

        data = json.loads(msg.value())
        db: Session = SessionLocal()
        compute_moving_average(data["symbol"], db)
        db.close()

    except Exception as e:
        logging.exception(f"[Kafka Consumer] Error: {e}")
