from fastapi import APIRouter, status, HTTPException, Depends
from sqlalchemy.orm import Session
from app.schemas.poll import PollingRequest, PollingResponse
from app.database.session import get_db
from app.models.polling_jobs import PollingJob
from uuid import uuid4


router = APIRouter(prefix="/prices", tags=["Polling Jobs Endpoint"])

@router.post("/poll",status_code=status.HTTP_202_ACCEPTED ,response_model=PollingResponse)
def polling_jobs(data: PollingRequest, db: Session = Depends(get_db)):
    job_ids = []

    for symbol in data.symbols:
        job_id = uuid4()
        polling_job = PollingJob(
            id= job_id,
            symbol=symbol,
            provider=data.provider,
            interval=data.interval,
            status="pending"
        )
        db.add(polling_job)
        job_ids.append(str(job_id))
    db.commit()
    return {
        "job_id":",".join(job_ids),
        "status": "pending",
        "config":{
            "symbols": data.symbols,
            "interval": data.interval
        }
    }
        
