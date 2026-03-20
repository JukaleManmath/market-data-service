from uuid import uuid4

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_async_db
from app.models.polling_jobs import PollingJob
from app.schemas.poll import PollingRequest, PollingResponse

router = APIRouter(prefix="/prices", tags=["Polling Jobs Endpoint"])


@router.post("/poll", status_code=status.HTTP_202_ACCEPTED, response_model=PollingResponse)
async def polling_jobs(data: PollingRequest, db: AsyncSession = Depends(get_async_db)):
    job_ids = []

    for symbol in data.symbols:
        job_id = uuid4()
        polling_job = PollingJob(
            id=job_id,
            symbol=symbol,
            provider=data.provider,
            interval=data.interval,
            status="pending",
        )
        db.add(polling_job)
        job_ids.append(str(job_id))

    await db.commit()
    return {
        "job_id": ",".join(job_ids),
        "status": "pending",
        "config": {
            "symbols": data.symbols,
            "interval": data.interval,
        },
    }
        
