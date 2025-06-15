import asyncio
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.database.session import SessionLocal
from app.models.polling_jobs import PollingJob, SuccessCriteria
from app.models.price_points import PricePoint
from app.services.provider import get_latest_prices

# Logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Loop check interval in seconds
DEFAULT_LOOP_INTERVAL = 10
PROVIDER="finnhub"

async def polling_worker():
    while True:
        db: Session = SessionLocal()
        try:
            jobs = db.query(PollingJob).filter(PollingJob.status != SuccessCriteria.failed).all()
            now = datetime.now(timezone.utc)

            for job in jobs:
                # If this is the first time, fallback to epoch
                last_polled = job.last_polled_at or datetime(1970, 1, 1, tzinfo=timezone.utc)
                next_poll_time = last_polled + timedelta(seconds=job.interval)

                if now >= next_poll_time:
                    logger.info(f"[{job.symbol}] Polling due (interval={job.interval}s)")
                    try:

                        data = await get_latest_prices(symbol=job.symbol,provider=PROVIDER, db=db, include_raw_id=True)

                        price_point = PricePoint(
                            symbol=data["symbol"],
                            price=data["price"],
                            timestamp=data["timestamp"],
                            provider=data["provider"],
                            raw_data_id=data["raw_data_id"]
                        )
                        db.add(price_point)

                        job.status = SuccessCriteria.success
                        job.last_polled_at = datetime.now(timezone.utc)
                        db.commit()

                        logger.info(f"[{job.symbol}] Price saved successfully")
                    except Exception as e:
                        logger.error(f"[{job.symbol}] Poll failed: {str(e)}")
                        job.status = SuccessCriteria.failed
                        db.commit()
                else:
                    logger.debug(f"[{job.symbol}] Not due for polling yet")

        except Exception as e:
            logger.error(f"[polling_worker] Fatal error: {str(e)}")

        finally:
            db.close()

        await asyncio.sleep(DEFAULT_LOOP_INTERVAL)
