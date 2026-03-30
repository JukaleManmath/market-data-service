from fastapi import APIRouter
from app.core.redis import redis_client

router = APIRouter(prefix="/demo", tags=["Demo"])

SEED_KEY = "mip:demo_portfolio_id"
SEED_FLAG = "mip:seed_data_active"
PORTFOLIO_NAME = "Tech Growth Portfolio"


@router.get("")
async def get_demo_config() -> dict:
    """
    Returns seed-data status so the frontend can auto-activate the demo portfolio
    and display a warning banner.
    """
    raw = await redis_client.get(SEED_KEY)
    if raw is None:
        return {"seeded": False, "portfolio_id": None, "portfolio_name": None}

    portfolio_id = raw.decode() if isinstance(raw, bytes) else str(raw)
    return {
        "seeded": True,
        "portfolio_id": portfolio_id,
        "portfolio_name": PORTFOLIO_NAME,
    }


@router.delete("")
async def clear_demo_flag() -> dict:
    """Called by the frontend 'Dismiss' button to hide the seed banner."""
    await redis_client.delete(SEED_FLAG)
    return {"cleared": True}
