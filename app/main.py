import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.alerts import router as alerts_router
from app.api.analytics import router as analytics_router
from app.api.portfolios import router as portfolios_router
from app.api.health import router as health_router
from app.api.insights import router as insights_router
from app.api.poll import router as poll_router
from app.api.prices import router as price_router
from app.api.stream import router as stream_router
from app.core.kafka_broadcaster import start_broadcaster
from app.core.logging import setup_logging
from app.kafka.producer import producer
from app.middleware.request_id import RequestIDMiddleware
from app.services.polling_worker_service import polling_worker

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(polling_worker())
    asyncio.create_task(start_broadcaster())
    yield
    producer.flush(timeout=10)


app = FastAPI(lifespan=lifespan)

app.add_middleware(RequestIDMiddleware)

app.include_router(health_router)
app.include_router(price_router)
app.include_router(poll_router)
app.include_router(alerts_router)
app.include_router(insights_router)
app.include_router(portfolios_router)
app.include_router(analytics_router)
app.include_router(stream_router)

app.mount("/ui", StaticFiles(directory="app/static", html=True), name="static")
