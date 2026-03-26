"""
Seed demo data for the Portfolio Intelligence Platform.

Inserts realistic synthetic price history for AAPL, NVDA, MSFT using
a geometric Brownian motion random walk, then creates a Demo Portfolio
with positions in each symbol and two sample alerts.

Usage (from project root, with .env loaded):
    docker exec marketdata-api python scripts/seed_demo.py
"""

import math
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # rely on environment variables being set directly

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Symbols to seed
SYMBOLS = [
    {"symbol": "AAPL",  "start_price": 190.0},
    {"symbol": "NVDA",  "start_price": 900.0},
    {"symbol": "MSFT",  "start_price": 400.0},
]
PROVIDER = "finnhub"
TICK_INTERVAL_MINUTES = 30

# Start from 2026-03-01 to stay within the guaranteed price_points_2026_03 partition
SEED_START = datetime(2026, 3, 1, 0, 0, 0, tzinfo=timezone.utc)
SEED_END   = datetime.now(timezone.utc)

BATCH_SIZE = 500


def gbm_prices(start: float, n: int, mu: float = 0.0001, sigma: float = 0.015) -> list[float]:
    """Generate n prices via geometric Brownian motion starting from start."""
    prices = [start]
    for _ in range(n - 1):
        z = random.gauss(0, 1)
        prices.append(prices[-1] * math.exp((mu - 0.5 * sigma ** 2) + sigma * z))
    return prices


def generate_timestamps(start: datetime, end: datetime, interval_minutes: int) -> list[datetime]:
    timestamps = []
    t = start
    while t <= end:
        timestamps.append(t)
        t += timedelta(minutes=interval_minutes)
    return timestamps


def insert_in_batches(cur: psycopg2.extensions.cursor, sql: str, rows: list, batch_size: int) -> None:
    for i in range(0, len(rows), batch_size):
        psycopg2.extras.execute_batch(cur, sql, rows[i:i + batch_size])


def main() -> None:
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL environment variable not set.")
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # ── Idempotency check ────────────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM price_points WHERE symbol = 'AAPL' AND provider = 'finnhub'")
    count = cur.fetchone()[0]
    if count >= 100:
        print(f"Demo data already seeded ({count} AAPL price points found). Nothing to do.")

        cur.execute("SELECT id FROM portfolios WHERE name = 'Demo Portfolio' LIMIT 1")
        row = cur.fetchone()
        if row:
            print(f"\nExisting Demo Portfolio UUID:\n  {row[0]}")
        cur.close()
        conn.close()
        return

    # ── Generate timestamps ──────────────────────────────────────────────────
    timestamps = generate_timestamps(SEED_START, SEED_END, TICK_INTERVAL_MINUTES)
    n = len(timestamps)
    print(f"Generating {n} ticks from {SEED_START.date()} to {SEED_END.date()} "
          f"({TICK_INTERVAL_MINUTES}-min intervals)")

    # ── Seed price data ──────────────────────────────────────────────────────
    for spec in SYMBOLS:
        symbol = spec["symbol"]
        prices = gbm_prices(spec["start_price"], n)

        raw_rows, price_rows = [], []
        for ts, price in zip(timestamps, prices):
            raw_id  = str(uuid.uuid4())
            pp_id   = str(uuid.uuid4())
            raw_json = f'{{"symbol":"{symbol}","c":{price:.4f},"provider":"{PROVIDER}"}}'
            raw_rows.append((raw_id, symbol, PROVIDER, ts, raw_json))
            price_rows.append((pp_id, symbol, round(price, 4), ts, PROVIDER, raw_id))

        insert_in_batches(
            cur,
            "INSERT INTO raw_market_data (id, symbol, provider, timestamp, raw_json) "
            "VALUES (%s, %s, %s, %s, %s)",
            raw_rows,
            BATCH_SIZE,
        )
        insert_in_batches(
            cur,
            "INSERT INTO price_points (id, symbol, price, timestamp, provider, raw_data_id) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            price_rows,
            BATCH_SIZE,
        )
        print(f"  {symbol}: {n} price points inserted")

    # ── Create Demo Portfolio ────────────────────────────────────────────────
    cur.execute("SELECT id FROM portfolios WHERE name = 'Demo Portfolio' LIMIT 1")
    existing = cur.fetchone()
    if existing:
        portfolio_id = str(existing[0])
        print(f"\nDemo Portfolio already exists: {portfolio_id}")
    else:
        portfolio_id = str(uuid.uuid4())
        cur.execute(
            "INSERT INTO portfolios (id, name, created_at) VALUES (%s, %s, NOW())",
            (portfolio_id, "Demo Portfolio"),
        )
        positions = [
            ("AAPL", 50.0, 190.0),
            ("NVDA", 10.0, 900.0),
            ("MSFT", 30.0, 400.0),
        ]
        for symbol, qty, cost in positions:
            cur.execute(
                "INSERT INTO positions "
                "(id, portfolio_id, symbol, provider, quantity, avg_cost_basis, is_active, opened_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, TRUE, NOW())",
                (str(uuid.uuid4()), portfolio_id, symbol, PROVIDER, qty, cost),
            )
        print(f"\nCreated portfolio 'Demo Portfolio': {portfolio_id}")
        for symbol, qty, cost in positions:
            print(f"  {symbol}: {qty:.0f} shares @ ${cost:.2f}")

    # ── Insert sample alerts ─────────────────────────────────────────────────
    alert_ts_1 = datetime.now(timezone.utc) - timedelta(hours=2)
    alert_ts_2 = datetime.now(timezone.utc) - timedelta(minutes=45)
    cur.execute(
        "INSERT INTO alerts "
        "(id, symbol, provider, anomaly_type, severity, price, z_score, resolved, timestamp) "
        "VALUES "
        "(%s, 'AAPL', 'finnhub', 'zscore_spike', 'high',   198.45, 3.72, FALSE, %s), "
        "(%s, 'NVDA', 'finnhub', 'ma_crossover',  'medium', 921.30, NULL, FALSE, %s)",
        (str(uuid.uuid4()), alert_ts_1, str(uuid.uuid4()), alert_ts_2),
    )
    print("Inserted 2 sample alerts (AAPL zscore_spike/high, NVDA ma_crossover/medium)")

    conn.commit()
    cur.close()
    conn.close()

    print(f"\n{'='*50}")
    print("Paste this portfolio UUID into the dashboard:")
    print(f"  {portfolio_id}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
