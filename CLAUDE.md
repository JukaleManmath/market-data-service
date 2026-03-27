# CLAUDE.md — Market Data Service

This file gives Claude instant project context. Read this before scanning files.

---

## What This Project Is

A **Portfolio Intelligence Platform** built on top of a real-time financial data pipeline.

**What it does:** Live price ingestion from multiple providers (Finnhub, Alpha Vantage) via a pluggable provider abstraction → Kafka streaming → partitioned PostgreSQL → Redis caching. Extended with technical analysis (RSI, MACD, Bollinger Bands), portfolio risk metrics (VaR, Sharpe, max drawdown, correlation), z-score anomaly detection, WebSocket streaming, a terminal-style browser dashboard, and Claude-powered natural language portfolio Q&A.

---

## Current State — Complete (8 Phases Done)

| Phase | What | Status |
|-------|------|--------|
| 1 | Bug fixes + OOP/SOLID refactor (provider abstraction, PriceService, MovingAverageService) | **Done** |
| 2 | DB partitioning, async SQLAlchemy, async Redis, Kafka tuning | **Done** |
| 3 | Anomaly detection (z-score + MA crossover) + Claude per-symbol summaries | **Done** |
| 4 | JSON logging, RequestID middleware, /health endpoint | **Done** |
| 5 | Portfolio model, live P&L snapshot, position management | **Done** |
| 6 | RSI/MACD/Bollinger, VaR/Sharpe/correlation (numpy) | **Done** |
| 7 | WebSocket streaming via aiokafka broadcaster + terminal dashboard | **Done** |
| 8 | Claude portfolio intelligence + natural language Q&A | **Done** |

---

## Project Structure

```
app/
  main.py                              # FastAPI app + lifespan: polling_worker + kafka_broadcaster
  api/
    prices.py                          # GET /prices/latest?symbol=&provider=
    poll.py                            # POST /prices/poll, DELETE /prices/poll/{job_id}
    alerts.py                          # GET /alerts/active (symbol/provider optional), POST /alerts/{id}/resolve
    insights.py                        # GET /insights/{symbol} — Claude per-symbol summary
    health.py                          # GET /health — Postgres SELECT 1 + Redis PING
    portfolios.py                      # POST /portfolios, DELETE /portfolios/{id},
                                       # POST/DELETE /portfolios/{id}/positions,
                                       # GET /portfolios/{id}/snapshot,
                                       # GET /portfolios/{id}/analysis,
                                       # POST /portfolios/{id}/ask
    analytics.py                       # GET /analytics/{symbol}/indicators, GET /analytics/portfolios/{id}/risk
    stream.py                          # WS /ws/prices/{symbol} — WebSocket price stream
  core/
    config.py                          # Settings via pydantic-settings (reads .env)
    redis.py                           # Async redis_client (redis.asyncio.Redis)
    logging.py                         # JSONFormatter + setup_logging() — structured JSON logs
    websocket_manager.py               # ConnectionManager — symbol → [WebSocket] pub/sub registry
    kafka_broadcaster.py               # start_broadcaster() — aiokafka consumer → manager.broadcast()
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
    portfolio.py                       # CreatePortfolioRequest, PortfolioResponse, AddPositionRequest,
                                       # PositionResponse, PortfolioSnapshot, PositionSnapshot,
                                       # PortfolioAnalysisResponse, AskQuestionRequest, AskQuestionResponse
    analytics.py                       # IndicatorResponse, RiskResponse, MACDSchema, BollingerSchema
  services/
    price_service.py                   # PriceService — 3-tier fetch orchestrator (injected deps)
    polling_worker_service.py          # polling_worker() — background task, builds PriceService per job
    moving_average_service.py          # MovingAverageService — MA calc + dedup persistence
    anomaly_detector.py                # AnomalyDetector — z-score (N=20, 3σ/4σ) + MA divergence (0.5%)
    ai_insights.py                     # AIInsightsService — AsyncAnthropic claude-sonnet-4-6, Redis 5 min cache
    portfolio_service.py               # PortfolioService — create/delete portfolio, add_or_update/close position, get_snapshot
    technical_analysis.py              # TechnicalAnalysisService — RSI (14), MACD (12/26/9 EMA), Bollinger Bands (20, 2σ)
    signal_generator.py                # SignalGenerator — voting on RSI/MACD/Bollinger → BUY/SELL/HOLD + confidence
    risk_engine.py                     # RiskEngine — parametric VaR (95%), Sharpe, max drawdown, correlation matrix
    portfolio_intelligence.py          # PortfolioIntelligenceService — full-context Claude analyst report, Redis 5 min cache
    market_qa.py                       # MarketQAService — Claude tool-use Q&A (get_price_history, get_technical_indicators, get_correlation), Redis 2 min cache
    providers/
      base.py                          # BaseProvider ABC + PriceFetchResult dataclass
      finnhub.py                       # FinnhubProvider(BaseProvider)
      alpha_vantage.py                 # AlphaVantageProvider(BaseProvider)
      registry.py                      # get_provider(name) → BaseProvider instance
  prompts/
    portfolio_analysis.py              # build_analysis_prompt(), build_qa_system_prompt(), build_qa_user_prompt()
static/
  index.html                           # Single-file terminal dashboard (vanilla JS, no build step). Served at /ui. Covers all 18 routes.
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
  requirements.txt                     # fastapi, sqlalchemy[asyncio], asyncpg, redis, confluent_kafka, aiokafka, anthropic, numpy, scipy
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
- **confluent_kafka** for producer and MA/anomaly consumers. Both stay sync by design.
- **Kafka producer** — `acks="all"`, `retries=5`. No per-message `flush()`. Flushed once on app shutdown via lifespan.
- **PriceService is per-request** — db session is request-scoped, so PriceService is too.
- **kafka_broadcaster uses aiokafka** — runs inside FastAPI's event loop as an asyncio task. MA and anomaly consumers still use confluent_kafka (sync, separate containers).
- **ConnectionManager is a module-level singleton** — `manager = ConnectionManager()` in `websocket_manager.py`. Shared between `stream.py` (WebSocket endpoint) and `kafka_broadcaster.py`.
- **delete_portfolio() hard-deletes position rows** — uses `DELETE FROM positions WHERE portfolio_id = ?` before deleting the portfolio row. FK constraint requires hard delete.
- **MarketQAService uses Claude tool use** — Claude actively calls tools to fetch data (price history, indicators, correlation) rather than receiving a pre-built static snapshot. Standard agentic loop: send → if `stop_reason == "tool_use"` execute tools → repeat → return final text.

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

GET /portfolios/{id}/analysis:
  └─> PortfolioIntelligenceService.analyze()
        ├─> snapshot + risk + indicators + alerts + 7-day price changes
        └─> Claude → structured JSON (regime, risks, recommendations, narrative)

POST /portfolios/{id}/ask:
  └─> MarketQAService.ask()
        └─> Claude tool-use loop → get_price_history / get_technical_indicators / get_correlation
```

---

## Database Schema

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `polling_jobs` | symbol, provider, interval, status (pending/success/failed), last_polled_at | Drives background polling |
| `raw_market_data` | id (UUID), symbol, provider, raw_json, timestamp | Raw API responses |
| `price_points` | id (UUID), symbol, price, timestamp, provider, raw_data_id (FK) | Partitioned by month (`RANGE` on timestamp). PK is `(id, timestamp)`. |
| `moving_average` | symbol, average_price, interval=5, provider, timestamp | 5-pt MA, deduped by timestamp |
| `alerts` | id, symbol, anomaly_type, severity, price, z_score, fast_ma, slow_ma, resolved | Uses `alertseverity` + `anomalytype` Postgres enums |
| `portfolios` | id (UUID), name, created_at | |
| `positions` | id (UUID), portfolio_id (FK), symbol, provider, quantity, avg_cost_basis, opened_at, closed_at, is_active | |

**Partitioning:** monthly `RANGE` on `price_points(timestamp)`. Partitions exist for 2026-03 through 2027-12 plus `price_points_future`.

**Migration gotcha:** Never use `op.create_table()` with Enum columns — SQLAlchemy ignores `create_type=False` and emits a second `CREATE TYPE`, causing `DuplicateObject` errors. Always use raw `op.execute()` SQL. See `c3f9a12b4e01_add_alerts_table.py`.

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
ANTHROPIC_API_KEY
```

---

## Docker Services

| Container | Port | Role |
|-----------|------|------|
| `marketdata-api` | 8000 | FastAPI + uvicorn |
| `ma-consumer` | — | Moving average Kafka consumer |
| `anomaly-consumer` | — | Anomaly detection Kafka consumer |
| `kafka` | 9092 | Message broker |
| `zookeeper` | 2181 | Kafka coordination |
| `postgres` | 5433 | Database |
| `redis` | 6379 | Cache |
| `adminer` | 8080 | DB admin UI |
| `kafka-init` | — | One-shot topic creation |

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
- **MA consumer uses sync session** — `SessionLocal`, not `AsyncSessionLocal`. confluent_kafka's poll loop is blocking.
- **price_points PK is `(id, timestamp)`** — Postgres requires the partition key in every unique constraint. Queries filtering only on `id` won't use the PK index efficiently; always include `timestamp`.
- **`--env-file .env` is required** — the compose file is in `docker/`, so Docker Compose won't find the root `.env` automatically. Always pass `--env-file .env` from the project root.
- **`anomaly_consumer` service key vs container name** — the Docker Compose service key is `anomaly_consumer` (underscore); the container name is `anomaly-consumer` (hyphen). `docker compose logs` takes the service key.
- **`pnl_pct` is a ratio, not a percentage** — `portfolio_service.get_snapshot()` returns `pnl_pct` as e.g. `0.389`. The dashboard multiplies by 100 for display. Do not add `* 100` back to the service.
- **`DELETE /prices/poll/{job_id}` hard-deletes the row** — the polling worker picks up jobs by querying the DB; deleting the row stops it from ever running again.
- **Dashboard portfolio UUID persists in localStorage** — `activatePortfolio(id, name, persist=true)` writes to `localStorage`. Page refresh restores the active portfolio automatically.
- **Never use `op.create_table()` with Enum columns** — use raw `op.execute()` SQL instead. See migration gotcha in Database Schema section above.
