import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.alerts import router as alerts_router
from app.api.portfolios import router as portfolios_router
from app.api.health import router as health_router
from app.api.insights import router as insights_router
from app.api.poll import router as poll_router
from app.api.prices import router as price_router
from app.core.logging import setup_logging
from app.kafka.producer import producer
from app.middleware.request_id import RequestIDMiddleware
from app.services.polling_worker_service import polling_worker

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background polling worker when the app starts up.
    # It runs forever, waking every 10s to fetch prices for due PollingJobs.
    asyncio.create_task(polling_worker())
    yield
    # Flush any in-flight Kafka messages before the process exits.
    # timeout=10 means: wait up to 10s for the broker to confirm, then give up.
    producer.flush(timeout=10)


app = FastAPI(lifespan=lifespan)

app.add_middleware(RequestIDMiddleware)

app.include_router(health_router)
app.include_router(price_router)
app.include_router(poll_router)
app.include_router(alerts_router)
app.include_router(insights_router)
app.include_router(portfolios_router)
