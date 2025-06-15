from confluent_kafka import Consumer, KafkaException
import json
import logging
import signal
import sys
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.database.session import SessionLocal
from app.models.price_points import PricePoint
from app.models.moving_average import MovingAverage
from datetime import datetime

logging.basicConfig(level=logging.INFO)

conf = {
    'bootstrap.servers': 'kafka:9092',
    'group.id': 'ma-consumer-group-test',
    'auto.offset.reset': 'earliest'
}

consumer = Consumer(conf)
consumer.subscribe(['price-events'])

print("MA Consumer started and listening to 'price-events'...")

def shutdown_handler(sig, frame):
    print("Shutting down consumer...")
    consumer.close()
    sys.exit(0)

signal.signal(signal.SIGINT, shutdown_handler)
signal.signal(signal.SIGTERM, shutdown_handler)

def compute_moving_average(symbol: str, provider: str, db: Session):
    rows = db.query(PricePoint).filter_by(symbol=symbol)\
        .order_by(PricePoint.timestamp.desc()).limit(5).all()
    if len(rows) == 5:
        avg_price = sum(r.price for r in rows) / 5
        latest_ts = max(r.timestamp for r in rows)

        exists = db.query(MovingAverage).filter_by(
            symbol=symbol,
            interval=5,
            timestamp=latest_ts,
            provider=provider
        ).first()

        if not exists:
            ma = MovingAverage(
                symbol=symbol,
                average_price=avg_price,
                interval=5,
                provider=provider,
                timestamp=latest_ts
            )
            db.add(ma)
            db.commit()
            logging.info(f"[MA] Inserted: {symbol} @ {latest_ts} → {avg_price:.2f}")
        else:
            logging.info(f"[MA] Already exists: {symbol} @ {latest_ts}")

while True:
    try:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            logging.debug("[Kafka] No message received yet...")
            continue
        if msg.error():
            raise KafkaException(msg.error())
        
        logging.info(f"[Kafka] Received message: {msg.value().decode('utf-8')}")

        data = json.loads(msg.value())
        db: Session = SessionLocal()
        compute_moving_average(data["symbol"], data["source"], db)
        db.close()

    except SQLAlchemyError as se:
        logging.exception(f"[DB ERROR] {se}")
    except Exception as e:
        logging.exception(f"[Kafka Consumer Error] {e}")
