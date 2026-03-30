import asyncio
import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.alerts import router as alerts_router
from app.api.demo import router as demo_router
from app.api.analytics import router as analytics_router
from app.api.docs import router as docs_router
from app.api.portfolios import router as portfolios_router
from app.api.health import router as health_router
from app.api.insights import router as insights_router
from app.api.poll import router as poll_router
from app.api.prices import router as price_router
from app.api.stream import router as stream_router
from app.core.kafka_broadcaster import start_broadcaster
from app.core.logging import setup_logging
from app.database.session import AsyncSessionLocal
from app.kafka.producer import producer
from app.middleware.request_id import RequestIDMiddleware
from app.models.polling_jobs import PollingJob
from app.services.polling_worker_service import polling_worker

setup_logging()

logger = logging.getLogger(__name__)

DEFAULT_STOCK_SYMBOLS = [
    "AAPL", "MSFT", "GOOGL", "NVDA", "TSLA",
    "AMZN", "META", "NFLX", "AMD", "INTC",
    "ORCL", "CRM", "ADBE", "PYPL", "UBER",
    "SPOT", "SHOP", "COIN", "SQ", "PLTR",
    "ARM", "SMCI", "TSM", "AVGO", "QCOM",
]

DEFAULT_CRYPTO_SYMBOLS = [
    "BTC", "ETH", "SOL", "BNB", "XRP",
    "ADA", "AVAX", "DOGE", "LINK", "DOT",
    "MATIC", "UNI", "LTC", "ATOM", "APT",
    "ARB", "OP", "INJ", "SUI", "SHIB",
]


async def _seed_default_polls() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(PollingJob.symbol, PollingJob.provider))
        existing = {(row[0], row[1]) for row in result.fetchall()}

        jobs_to_add = []
        for symbol in DEFAULT_STOCK_SYMBOLS:
            if (symbol, "finnhub") not in existing:
                jobs_to_add.append(PollingJob(
                    id=uuid4(), symbol=symbol,
                    provider="finnhub", interval=60, status="pending",
                ))
        for symbol in DEFAULT_CRYPTO_SYMBOLS:
            if (symbol, "binance") not in existing:
                jobs_to_add.append(PollingJob(
                    id=uuid4(), symbol=symbol,
                    provider="binance", interval=15, status="pending",
                ))

        if not jobs_to_add:
            return
        for job in jobs_to_add:
            db.add(job)
        await db.commit()
        logger.info("Seeded %d default polling jobs", len(jobs_to_add))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _seed_default_polls()
    asyncio.create_task(polling_worker())
    asyncio.create_task(start_broadcaster())
    yield
    producer.flush(timeout=10)


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestIDMiddleware)

app.include_router(health_router)
app.include_router(docs_router)
app.include_router(price_router)
app.include_router(poll_router)
app.include_router(alerts_router)
app.include_router(insights_router)
app.include_router(portfolios_router)
app.include_router(analytics_router)
app.include_router(stream_router)
app.include_router(demo_router)
