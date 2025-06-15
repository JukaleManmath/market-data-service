from fastapi import FastAPI
from app.api.prices import router as price_router
from app.api.poll import router as poll_router
from app.services.polling_worker_service import polling_worker
import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(polling_worker())
    yield

app = FastAPI(lifespan=lifespan)

app.include_router(price_router)
app.include_router(poll_router)
