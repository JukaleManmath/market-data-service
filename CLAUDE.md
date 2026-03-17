# CLAUDE.md — Market Data Service

This file gives Claude instant project context. Read this before scanning files.

---

## What This Project Is

A **Portfolio Intelligence Platform** built on top of a real-time financial data pipeline.

**End goal:** A system a quantitative analyst or portfolio manager would actually use — live price monitoring, anomaly detection, technical indicators, portfolio risk metrics (VaR, Sharpe), WebSocket streaming, and Claude-powered natural language portfolio Q&A.

Full 9-phase build plan is in [README.md](README.md).

---

## Current State — Phase 1 Complete

Bugs fixed and codebase fully refactored with OOP + SOLID principles. Ready for Phase 2.

| Phase | What | Status |
|-------|------|--------|
| 1 | Fix 3 bugs + OOP/SOLID refactor (provider abstraction, PriceService, MovingAverageService) | **Done** |
| 2 | Async SQLAlchemy, DB partitioning, Kafka tuning, async Redis | Not started |
| 3 | Anomaly detection (z-score + MA crossover) + Claude per-symbol summaries | Not started |
| 4 | JSON logging, RequestID middleware, /health endpoint | Not started |
| 5 | Portfolio model, live P&L snapshot, position management | Not started |
| 6 | RSI/MACD/Bollinger, VaR/Sharpe/correlation (numpy) | Not started |
| 7 | WebSocket streaming via aiokafka broadcaster | Not started |
| 8 | Claude portfolio intelligence + natural language Q&A | Not started |
| 9 | Rate limiting, API key auth, Prometheus + Grafana, webhooks | Not started |

---

## Project Structure

```
app/
  main.py                              # FastAPI app + lifespan starts polling_worker
  api/
    prices.py                          # GET /prices/latest?symbol=&provider=
    poll.py                            # POST /prices/poll
  core/
    config.py                          # Settings via pydantic-settings (reads .env)
    redis.py                           # Sync redis_client — Phase 2 → redis.asyncio
  database/
    base.py                            # SQLAlchemy declarative Base (imports all models)
    session.py                         # Sync SessionLocal + get_db() — Phase 2 → AsyncSession
  kafka/
    producer.py                        # send_price_event() → price-events topic
    consumer.py                        # start_consumer() — Kafka loop, delegates to MovingAverageService
  models/
    price_points.py                    # PricePoint — symbol, price, timestamp, provider, raw_data_id
    polling_jobs.py                    # PollingJob — symbol, provider, interval, status, last_polled_at
    raw_market_data.py                 # RawMarketData — raw JSON from external APIs
    moving_average.py                  # MovingAverage — 5-pt MA results
  schemas/
    price.py                           # PriceResponse
    poll.py                            # PollingRequest / PollingResponse
  services/
    price_service.py                   # PriceService — 3-tier fetch orchestrator (injected deps)
    polling_worker_service.py          # polling_worker() — background task, builds PriceService per job
    moving_average_service.py          # MovingAverageService — MA calc + dedup persistence
    providers/
      base.py                          # BaseProvider ABC + PriceFetchResult dataclass
      finnhub.py                       # FinnhubProvider(BaseProvider)
      alpha_vantage.py                 # AlphaVantageProvider(BaseProvider)
      registry.py                      # get_provider(name) → BaseProvider instance
scripts/
  run_ma_consumer.py                   # Entry point for ma-consumer container
docker/
  docker-compose.yml                   # All 8 containers
  entrypoint.sh                        # Waits for Postgres → alembic upgrade head → uvicorn
  init-scripts/kafka-init.sh           # One-shot: creates price-events topic
alembic-migrations/
  env.py                               # Alembic env — reads settings, imports all models
  script.py.mako                       # Template for generating new migration files
  versions/                            # Migration history — applied in order on startup
requirements/
  requirements.txt                     # Sync-only stack (no asyncpg yet)
```

---

## Architecture — OOP/SOLID Design

### Adding a new price provider (OCP)
1. Create `app/services/providers/<name>.py` — subclass `BaseProvider`, implement `name` and `fetch()`
2. Add one line to `app/services/providers/registry.py` — nothing else changes

### PriceService 3-tier lookup
```
PriceService.get_latest_price(symbol)
  ├── _get_from_cache()    → Redis (key: "{symbol.lower()}:{provider.name}")
  ├── _get_from_db()       → PricePoint WHERE timestamp >= now - TTL
  └── provider.fetch()     → External API (3 retries, exp backoff inside provider)
        ├── _persist()     → RawMarketData + PricePoint
        ├── _write_to_cache()
        └── _publish_to_kafka() (if publish_to_kafka=True)
```

### Key design decisions
- **Sync SQLAlchemy** — `SessionLocal` / `Session`. Phase 2 → `AsyncSession`.
- **Sync Redis** — `redis_client.get/setex`. Phase 2 → `redis.asyncio`.
- **Cache key** — `{symbol.lower()}:{provider}`. Phase 2 → `price:{SYMBOL}:{provider}`.
- **confluent_kafka** for both producer and consumer. MA consumer stays sync.
- **PriceService is per-request** — db session is request-scoped, so PriceService is too.
- **No auth, no rate limiting** — Phase 9.

---

## Data Flow

```
POST /prices/poll
  └─> Creates PollingJob (status=pending)

polling_worker (every 10s):
  └─> For each due job → PriceService(provider=get_provider(job.provider), ...)
        └─> get_latest_price(symbol, publish_to_kafka=True)

GET /prices/latest?symbol=AAPL&provider=finnhub
  └─> PriceService(provider=get_provider("finnhub"), ...).get_latest_price(symbol)

MA Consumer (separate container, price-events topic):
  └─> MovingAverageService(db).compute_and_store(symbol, provider)
        └─> 5 most recent PricePoints → avg → store MovingAverage (deduped)
```

---

## Database Schema

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `polling_jobs` | symbol, provider, interval, status (pending/success/failed), last_polled_at | Drives background polling |
| `raw_market_data` | id (UUID), symbol, provider, raw_json, timestamp | Raw API responses |
| `price_points` | id (UUID), symbol, price, timestamp, provider, raw_data_id (FK) | Not yet partitioned |
| `moving_average` | symbol, average_price, interval=5, provider, timestamp | 5-pt MA, deduped by timestamp |

**Phase 2 adds:** monthly `RANGE` partitioning on `price_points(timestamp)`.
**Phase 3 adds:** `alerts` table with `AlertSeverity` and `AnomalyType` enums.
**Phase 5 adds:** `portfolios` and `positions` tables.

---

## Environment Variables (`.env`)

```
DATABASE_URL              # postgresql://user:pass@host:port/db (sync format)
ALPHA_VANTAGE_API_KEY
FINNHUB_API_KEY
REDIS_HOST
REDIS_PORT
DB_PRICE_TTL              # Cache/DB freshness window in seconds (default 60)
KAFKA_BOOTSTRAP_SERVERS
REDIS_URL
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
# Phase 3+:
ANTHROPIC_API_KEY
# Phase 9+:
ALERT_WEBHOOK_URLS        # Comma-separated webhook URLs
```

---

## Docker Services

| Container | Port | Role |
|-----------|------|------|
| `marketdata-api` | 8000 | FastAPI + uvicorn |
| `ma-consumer` | — | Moving average Kafka consumer |
| `kafka` | 9092 | Message broker |
| `zookeeper` | 2181 | Kafka coordination |
| `postgres` | 5433 | Database |
| `redis` | 6379 | Cache |
| `adminer` | 8080 | DB admin UI |
| `kafka-init` | — | One-shot topic creation |

**Phase 3 adds:** `anomaly_consumer` container.
**Phase 9 adds:** `prometheus` (9090) and `grafana` (3000).

---

## Dependencies

Current `requirements/requirements.txt`:
- `fastapi`, `uvicorn`, `uvloop` — web server
- `sqlalchemy`, `alembic`, `psycopg2-binary` — sync DB
- `redis` — sync Redis client
- `confluent_kafka` — Kafka
- `httpx` — async HTTP for external APIs
- `pydantic-settings` — config

**To add per phase:**
- Phase 2: `asyncpg`, `sqlalchemy[asyncio]`, `redis[asyncio]`
- Phase 6: `numpy`, `scipy`
- Phase 7: `aiokafka`
- Phase 8: `anthropic`
- Phase 9: `prometheus-client`

---

## Common Commands

```bash
# Start everything
docker compose -f docker/docker-compose.yml up --build

# Rebuild a single service
docker compose -f docker/docker-compose.yml up --build api

# View logs
docker compose -f docker/docker-compose.yml logs -f marketdata-api
docker compose -f docker/docker-compose.yml logs -f ma-consumer

# Run migrations manually inside the container
docker exec -it marketdata-api alembic upgrade head

# Generate a new migration (after changing a model)
docker exec -it marketdata-api alembic revision --autogenerate -m "description"

# Test price fetch
curl "http://localhost:8000/prices/latest?symbol=AAPL&provider=finnhub"

# Create polling job
curl -X POST http://localhost:8000/prices/poll \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL", "NVDA"], "interval": 30, "provider": "finnhub"}'

# Check DB directly
docker exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT * FROM price_points LIMIT 5;"

# Wipe everything (including DB volume)
docker compose -f docker/docker-compose.yml down -v
```

---

## Gotchas

- **Never add logic to `consumer.py`** — it owns the Kafka loop only. Business logic goes in a service class.
- **Never import `settings` inside a provider class body** — keys are injected via constructor from `registry.py`.
- **PriceService is not a singleton** — instantiate it per request/job tick with the correct `db` session.
- **`include_raw_id` parameter is gone** — it was part of the old duplicate-write bug. `_persist()` always writes both `RawMarketData` and `PricePoint`.
- **MA consumer runs in a separate container** — it has its own DB session lifecycle, independent of the API.
- **Cache key format changes in Phase 2** — current: `{symbol.lower()}:{provider}`, future: `price:{SYMBOL}:{provider}`.
