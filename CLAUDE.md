# CLAUDE.md — Market Data Service

This file gives Claude instant project context. Read this before scanning files.

---

## What This Project Is

A **Portfolio Intelligence Platform** built on top of a real-time financial data pipeline.

**End goal:** A system a quantitative analyst or portfolio manager would actually use — live price monitoring, anomaly detection, technical indicators, portfolio risk metrics (VaR, Sharpe), WebSocket streaming, Claude-powered natural language portfolio Q&A, and a minimal terminal-style browser dashboard to make everything visible without curling endpoints.

Full 9-phase build plan is in [README.md](README.md).

---

## Current State — Phase 5 Complete

Portfolio management layer live. Portfolios, positions, live P&L snapshot. Ready for Phase 6.

| Phase | What | Status |
|-------|------|--------|
| 1 | Fix 3 bugs + OOP/SOLID refactor (provider abstraction, PriceService, MovingAverageService) | **Done** |
| 2 | DB partitioning, async SQLAlchemy, async Redis, Kafka tuning | **Done** |
| 3 | Anomaly detection (z-score + MA crossover) + Claude per-symbol summaries | **Done** |
| 4 | JSON logging, RequestID middleware, /health endpoint | **Done** |
| 5 | Portfolio model, live P&L snapshot, position management | **Done** |
| 6 | RSI/MACD/Bollinger, VaR/Sharpe/correlation (numpy) | Not started |
| 7 | WebSocket streaming via aiokafka broadcaster + minimal terminal UI (`app/static/index.html`) | Not started |
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
    alerts.py                          # GET /alerts/active, POST /alerts/{id}/resolve
    insights.py                        # GET /insights/{symbol} — Claude summary
    health.py                          # GET /health — Postgres SELECT 1 + Redis PING
    portfolios.py                      # POST /portfolios, POST/DELETE /portfolios/{id}/positions, GET /portfolios/{id}/snapshot
  core/
    config.py                          # Settings via pydantic-settings (reads .env)
    redis.py                           # Async redis_client (redis.asyncio.Redis)
    logging.py                         # JSONFormatter + setup_logging() — structured JSON logs
  middleware/
    request_id.py                      # UUID per request, propagated as X-Request-ID header
  database/
    base.py                            # SQLAlchemy declarative Base (imports all models)
    session.py                         # Sync SessionLocal (MA consumer) + AsyncSessionLocal + get_async_db()
  kafka/
    producer.py                        # send_price_event() → price-events topic; send_portfolio_event() → portfolio-events topic
    consumer.py                        # start_consumer() — Kafka loop, delegates to MovingAverageService
    anomaly_consumer.py                # start_consumer() — anomaly-consumer-group, delegates to AnomalyDetector
  models/
    price_points.py                    # PricePoint — symbol, price, timestamp, provider, raw_data_id
    polling_jobs.py                    # PollingJob — symbol, provider, interval, status, last_polled_at
    raw_market_data.py                 # RawMarketData — raw JSON from external APIs
    moving_average.py                  # MovingAverage — 5-pt MA results
    alerts.py                          # Alert — anomaly_type, severity, price, z_score, fast_ma, slow_ma, resolved
    portfolio.py                       # Portfolio — id, name, created_at
    position.py                        # Position — id, portfolio_id, symbol, provider, quantity, avg_cost_basis, opened_at, closed_at, is_active
  schemas/
    price.py                           # PriceResponse
    poll.py                            # PollingRequest / PollingResponse
    alerts.py                          # AlertResponse
    portfolio.py                       # CreatePortfolioRequest, PortfolioResponse, AddPositionRequest, PositionResponse, PortfolioSnapshot
  services/
    price_service.py                   # PriceService — 3-tier fetch orchestrator (injected deps)
    polling_worker_service.py          # polling_worker() — background task, builds PriceService per job
    moving_average_service.py          # MovingAverageService — MA calc + dedup persistence
    anomaly_detector.py                # AnomalyDetector — z-score (N=20, 3σ/4σ) + MA divergence (0.5%)
    ai_insights.py                     # AIInsightsService — AsyncAnthropic claude-sonnet-4-6, Redis 5 min cache
    portfolio_service.py               # PortfolioService — create_portfolio, add_or_update_position, close_position, get_snapshot
    providers/
      base.py                          # BaseProvider ABC + PriceFetchResult dataclass
      finnhub.py                       # FinnhubProvider(BaseProvider)
      alpha_vantage.py                 # AlphaVantageProvider(BaseProvider)
      registry.py                      # get_provider(name) → BaseProvider instance
static/
  index.html                           # Phase 7 — single-file terminal dashboard (vanilla JS, no build step)
scripts/
  run_ma_consumer.py                   # Entry point for ma-consumer container
  run_anomaly_consumer.py              # Entry point for anomaly-consumer container
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
- **Async SQLAlchemy** — `AsyncSessionLocal` / `AsyncSession` for API + polling worker. Sync `SessionLocal` kept for the MA consumer (confluent_kafka is blocking).
- **Async Redis** — `redis.asyncio.Redis`. Cache key: `{symbol.lower()}:{provider}`.
- **confluent_kafka** for both producer and consumer. MA consumer stays sync by design.
- **Kafka producer** — `acks="all"`, `retries=5`. No per-message `flush()`. Flushed once on app shutdown via lifespan.
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
| `price_points` | id (UUID), symbol, price, timestamp, provider, raw_data_id (FK) | Partitioned by month (`RANGE` on timestamp). PK is `(id, timestamp)`. |
| `moving_average` | symbol, average_price, interval=5, provider, timestamp | 5-pt MA, deduped by timestamp |

**Phase 2 done:** monthly `RANGE` partitioning on `price_points(timestamp)`. Partitions exist for 2026-03 through 2027-12 plus `price_points_future`.
**Phase 3 done:** `alerts` table with `alertseverity` and `anomalytype` Postgres enums + `resolved` boolean. Migration uses raw `op.execute()` SQL throughout — `op.create_table()` with `create_type=False` was silently ignored by SQLAlchemy, causing `DuplicateObject` errors.
**Phase 5 done:** `portfolios` and `positions` tables. Migration `e5f6a7b8c9d0_add_portfolio_tables.py` uses raw `op.execute()` SQL (same pattern as alerts).

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

**Phase 3 done:** `anomaly_consumer` container added.
**Phase 9 adds:** `prometheus` (9090) and `grafana` (3000).

---

## Dependencies

Current `requirements/requirements.txt`:
- `fastapi`, `uvicorn`, `uvloop` — web server
- `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `psycopg2-binary` — async DB (sync kept for MA consumer)
- `redis` — includes `redis.asyncio` client
- `confluent_kafka` — Kafka
- `httpx` — async HTTP for external APIs
- `pydantic-settings` — config

**Phase 3 added:** `anthropic`

**To add per phase:**
- Phase 6: `numpy`, `scipy`
- Phase 7: `aiokafka`
- Phase 9: `prometheus-client`

---

## Common Commands

```bash
# Start everything (--env-file required — compose file lives in docker/, .env is at root)
docker compose -f docker/docker-compose.yml --env-file .env up --build

# Rebuild a single service
docker compose -f docker/docker-compose.yml --env-file .env up --build api

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
docker exec postgres psql -U postgres -d marketdata -c "SELECT * FROM price_points LIMIT 5;"

# Check partition structure
docker exec postgres psql -U postgres -d marketdata -c "\d+ price_points"

# Wipe everything (including DB volume)
docker compose -f docker/docker-compose.yml down -v
```

---

## Gotchas

- **Never add logic to `consumer.py`** — it owns the Kafka loop only. Business logic goes in a service class.
- **Never import `settings` inside a provider class body** — keys are injected via constructor from `registry.py`.
- **PriceService is not a singleton** — instantiate it per request/job tick with the correct `db` session.
- **`include_raw_id` parameter is gone** — it was part of the old duplicate-write bug. `_persist()` always writes both `RawMarketData` and `PricePoint`.
- **MA consumer uses sync session** — `SessionLocal`, not `AsyncSessionLocal`. confluent_kafka's poll loop is blocking.
- **price_points PK is `(id, timestamp)`** — Postgres requires the partition key in every unique constraint. Queries filtering only on `id` won't use the PK index efficiently; always include `timestamp`.
- **`--env-file .env` is required** — the compose file is in `docker/`, so Docker Compose won't find the root `.env` automatically. Always pass `--env-file .env` from the project root.
- **Never use `op.create_table()` with Enum columns** — SQLAlchemy ignores `create_type=False` inside `op.create_table()` and emits a second `CREATE TYPE`, causing `DuplicateObject` errors. Always use `op.execute()` with raw SQL for the full CREATE TABLE when the table references custom Postgres enum types. See `c3f9a12b4e01_add_alerts_table.py`.
- **`anomaly_consumer` service key vs container name** — the Docker Compose service key is `anomaly_consumer` (underscore); the container name is `anomaly-consumer` (hyphen). `docker compose logs` takes the service key.
