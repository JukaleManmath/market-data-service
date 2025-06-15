from confluent_kafka import Producer
import json
import logging
from app.core.config import settings

conf = {
    'bootstrap.servers': settings.kafka_bootstrap_servers,  
    'client.id': 'market-data-producer'
}

producer = Producer(**conf)

def delivery_report(err, msg):
    if err is not None:
        logging.error(f"[Kafka] Message delivery failed: {err}")
    else:
        logging.info(f"[Kafka] Message delivered to {msg.topic()} [{msg.partition()}]")

async def send_price_event(symbol, price, timestamp, provider, raw_response_id):
    message = {
        "symbol": symbol,
        "price": price,
        "timestamp": timestamp,
        "source": provider,
        "raw_response_id": raw_response_id
    }

    try:
        producer.produce(
            topic="price-events",
            key=symbol,
            value=json.dumps(message),
            callback=delivery_report
        )
        producer.flush()
    except Exception as e:
        logging.exception(f"[Kafka] Failed to send message: {e}")
