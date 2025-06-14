from fastapi import FastAPI
from app.api.prices import router

app = FastAPI()

app.include_router(router)
