#!/usr/bin/env python3
"""
Seed script — Market Intelligence Platform demo data.

Run automatically by the `seed` Docker service after the API is healthy.
Can also be run manually:  python3 scripts/seed_demo_data.py

What it does
────────────
1. Wait for DB + API to be healthy
2. Insert ~200 realistic price points per symbol directly into Postgres
   (no Finnhub key required — data is a seeded random walk)
3. Create "Tech Growth Portfolio" with 5 positions via API
4. Start Finnhub polling jobs so live data gradually replaces seed data
5. Write demo portfolio ID to Redis so the frontend auto-activates it
   and shows a "Demo data" warning banner

Idempotent: if mip:demo_portfolio_id already exists in Redis the script
exits cleanly without duplicating data.
"""
import asyncio
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg
import redis as redis_lib

# ── Config ─────────────────────────────────────────────────────────────────────

API_BASE = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/marketdata")
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
PROVIDER = "finnhub"
PORTFOLIO_NAME = "Tech Growth Portfolio"
SEED_KEY = "mip:demo_portfolio_id"
SEED_FLAG = "mip:seed_data_active"
SEED_POINTS = 200   # price history rows per symbol

# Base prices and per-step volatility
SYMBOLS: dict[str, dict[str, float]] = {
    "AAPL":  {"base": 185.0,  "vol": 0.008,  "drift": 0.0002},
    "NVDA":  {"base": 850.0,  "vol": 0.015,  "drift": 0.0004},
    "TSLA":  {"base": 245.0,  "vol": 0.018,  "drift": -0.0001},
    "MSFT":  {"base": 410.0,  "vol": 0.007,  "drift": 0.0003},
    "GOOGL": {"base": 175.0,  "vol": 0.010,  "drift": 0.0002},
}

# Portfolio positions: symbol → (quantity, cost_basis_usd)
POSITIONS: dict[str, tuple[float, float]] = {
    "AAPL":  (15,  175.00),
    "NVDA":  (5,   800.00),
    "TSLA":  (8,   250.00),
    "MSFT":  (10,  380.00),
    "GOOGL": (4,   168.00),
}

# ── HTTP helpers ───────────────────────────────────────────────────────────────

def _http(method: str, url: str, body: Any = None, timeout: int = 15) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        raise RuntimeError(f"HTTP {e.code}: {raw.decode()[:400]}")


def api_get(path: str) -> Any:
    return _http("GET", f"{API_BASE}{path}")


def api_post(path: str, body: Any) -> Any:
    return _http("POST", f"{API_BASE}{path}", body)


# ── Price generation ───────────────────────────────────────────────────────────

def generate_price_walk(base: float, vol: float, drift: float, n: int) -> list[float]:
    """Geometric Brownian Motion — returns n prices."""
    rng = random.Random(int(base * 1000))      # deterministic per symbol
    prices: list[float] = [base]
    for _ in range(n - 1):
        ret = drift + vol * rng.gauss(0, 1)
        prices.append(max(prices[-1] * math.exp(ret), 1.0))
    return prices


# ── Database seed ──────────────────────────────────────────────────────────────

async def seed_prices(conn: asyncpg.Connection) -> None:
    now = datetime.now(tz=timezone.utc)

    for symbol, cfg in SYMBOLS.items():
        prices = generate_price_walk(cfg["base"], cfg["vol"], cfg["drift"], SEED_POINTS)
        records = []
        for i, price in enumerate(prices):
            ts = now - timedelta(minutes=(SEED_POINTS - i))
            records.append((
                uuid.uuid4(),
                symbol,
                round(price, 4),
                ts,
                PROVIDER,
            ))

        # Bulk insert — raw_data_id is nullable so we skip it for seed rows
        await conn.executemany(
            """
            INSERT INTO price_points (id, symbol, price, timestamp, provider)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
            """,
            records,
        )
        last_price = records[-1][2]
        print(f"      ✓ {symbol}: {SEED_POINTS} points  last={last_price:.2f}")


# ── Redis helper ───────────────────────────────────────────────────────────────

def redis_set_demo(portfolio_id: str) -> None:
    r = redis_lib.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    r.set(SEED_KEY, portfolio_id)
    r.set(SEED_FLAG, "1")
    r.close()


def redis_already_seeded() -> str | None:
    try:
        r = redis_lib.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        val = r.get(SEED_KEY)
        r.close()
        return val
    except Exception:
        return None


# ── Steps ──────────────────────────────────────────────────────────────────────

def wait_for_api(timeout_s: int = 120) -> None:
    print(f"\n[1/5] Waiting for API at {API_BASE} ...", flush=True)
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            h = api_get("/health")
            if h and h.get("status") == "ok":
                pg, rd = h.get("postgres", "?"), h.get("redis", "?")
                print(f"      OK  postgres={pg}  redis={rd}")
                return
        except Exception:
            pass
        time.sleep(3)
    print("ERROR: API did not become healthy within timeout.")
    sys.exit(1)


async def seed_database() -> None:
    print(f"\n[2/5] Inserting seed price history into Postgres ...", flush=True)
    # asyncpg needs plain postgresql:// (strip +asyncpg or +psycopg2 if present)
    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://") \
                       .replace("postgresql+psycopg2://", "postgresql://")
    conn = await asyncpg.connect(url)
    try:
        await seed_prices(conn)
    finally:
        await conn.close()
    print(f"      Done — {SEED_POINTS * len(SYMBOLS)} rows inserted.")


def create_portfolio() -> str:
    print(f"\n[3/5] Creating portfolio '{PORTFOLIO_NAME}' ...", flush=True)
    resp = api_post("/portfolios", {"name": PORTFOLIO_NAME})
    pid: str = resp["id"]
    print(f"      Portfolio ID: {pid}")
    return pid


def add_positions(portfolio_id: str) -> None:
    print(f"\n[4/5] Adding positions ...", flush=True)
    for symbol, (qty, price) in POSITIONS.items():
        try:
            api_post(f"/portfolios/{portfolio_id}/positions", {
                "symbol": symbol,
                "quantity": qty,
                "price": price,
                "provider": PROVIDER,
            })
            print(f"      + {symbol}  qty={qty}  cost=${price:.2f}")
        except RuntimeError as exc:
            print(f"      ! {symbol}: {exc}")


def start_polling() -> None:
    print(f"\n[5/5] Starting live Finnhub polling jobs (30s interval) ...", flush=True)
    try:
        resp = api_post("/prices/poll", {
            "symbols": list(SYMBOLS.keys()),
            "interval": 30,
            "provider": PROVIDER,
        })
        print(f"      Job IDs: {resp['job_id']}")
        print(f"      Live data will replace seed prices within ~30 seconds.")
    except RuntimeError as exc:
        print(f"      Warning: could not start polling: {exc}")


def print_summary(portfolio_id: str) -> None:
    line = "─" * 64
    print(f"\n{line}")
    print("  SEED COMPLETE")
    print(line)
    print(f"  Portfolio : {PORTFOLIO_NAME}")
    print(f"  ID        : {portfolio_id}")
    print()
    print("  The frontend (http://localhost:3000) will automatically")
    print("  load this portfolio and show a 'Demo data' banner.")
    print("  The banner disappears once live Finnhub data arrives.")
    print(f"{line}\n")

    try:
        snap = api_get(f"/portfolios/{portfolio_id}/snapshot")
        if snap:
            print(f"  Snapshot   total_value=${snap['total_value']:.2f}"
                  f"  total_pnl=${snap['total_pnl']:.2f}"
                  f"  positions={len(snap['positions'])}")
    except Exception:
        pass
    print()


# ── Entry point ────────────────────────────────────────────────────────────────

async def main() -> None:
    print("\nMarket Intelligence Platform — Demo Seed Script")
    print(f"API={API_BASE}  DB=<from env>  Redis={REDIS_HOST}:{REDIS_PORT}\n")

    # Idempotency check
    existing = redis_already_seeded()
    if existing:
        print(f"[skip] Already seeded (portfolio_id={existing}). Exiting.")
        return

    wait_for_api()
    await seed_database()
    portfolio_id = create_portfolio()
    add_positions(portfolio_id)
    start_polling()
    redis_set_demo(portfolio_id)
    print_summary(portfolio_id)


if __name__ == "__main__":
    asyncio.run(main())
