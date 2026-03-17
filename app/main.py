import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.prices import router as price_router
from app.api.poll import router as poll_router
from app.services.polling_worker_service import polling_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background polling worker when the app starts up.
    # It runs forever, waking every 10s to fetch prices for due PollingJobs.
    asyncio.create_task(polling_worker())
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(price_router)
app.include_router(poll_router)
