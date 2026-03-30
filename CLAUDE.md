# CLAUDE.md — Market Data Service

This file gives Claude instant project context. Read this before scanning files.

---

## What This Project Is

A **Portfolio Intelligence Platform** built on top of a real-time financial data pipeline.

**Stack:** FastAPI · PostgreSQL (partitioned) · Redis · Kafka · React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion

**What it does:** Live price ingestion from Finnhub (stocks) and Binance US (crypto, no key) via a pluggable provider abstraction → Kafka streaming → partitioned PostgreSQL → Redis caching. Extended with technical analysis (RSI, MACD, Bollinger Bands), portfolio risk metrics (VaR, Sharpe, max drawdown, correlation), z-score anomaly detection, WebSocket streaming, a full React frontend, and Claude-powered natural language portfolio Q&A.

---

## Current State

| Area | Status |
|------|--------|
| Backend pipeline (ingestion, Kafka, partitioned DB, Redis) | Done |
| Provider abstraction (Finnhub, Alpha Vantage, Binance US) | Done |
| Anomaly detection + Claude per-symbol summaries | Done |
| Portfolio management (P&L, weighted avg cost basis, positions) | Done |
| Technical analysis (RSI/MACD/Bollinger) + risk engine (VaR/Sharpe) | Done |
| WebSocket streaming + Claude portfolio intelligence + NL Q&A | Done |
| React frontend (Markets, Crypto, Portfolio, Analytics, Alerts, AI, Guide) | Done |
| Multi-portfolio support (stock + crypto types) | Done |

---

## Project Structure

```
app/
  main.py                              # FastAPI app + lifespan; seeds 25 stock + 20 crypto polling jobs on startup
  api/
    prices.py                          # GET /prices/latest, GET /prices/history
    poll.py                            # POST /prices/poll, DELETE /prices/poll/{job_id}
    alerts.py                          # GET /alerts/active, POST /alerts/{id}/resolve
    insights.py                        # GET /insights/{symbol} — Claude per-symbol summary
    health.py                          # GET /health — Postgres SELECT 1 + Redis PING
    portfolios.py                      # POST /portfolios, DELETE /portfolios/{id}
                                       # POST/DELETE /portfolios/{id}/positions
                                       # GET /portfolios/{id}/snapshot
                                       # GET /portfolios/{id}/analysis
                                       # POST /portfolios/{id}/ask
    analytics.py                       # GET /analytics/{symbol}/indicators, GET /analytics/portfolios/{id}/risk
    stream.py                          # WS /ws/prices/{symbol}
    docs.py                            # GET /guide — interactive documentation data
    demo.py                            # GET /demo, DELETE /demo — demo seed state
  core/
    config.py                          # Settings via pydantic-settings (reads .env)
    redis.py                           # Async redis_client (redis.asyncio.Redis)
    logging.py                         # JSONFormatter + setup_logging()
    websocket_manager.py               # ConnectionManager — symbol → [WebSocket] pub/sub, module-level singleton
    kafka_broadcaster.py               # start_broadcaster() — aiokafka consumer → manager.broadcast()
  middleware/
    request_id.py                      # UUID per request, X-Request-ID header
  database/
    base.py                            # SQLAlchemy declarative Base
    session.py                         # Sync SessionLocal (MA consumer) + AsyncSessionLocal + get_async_db()
  kafka/
    producer.py                        # send_price_event() → price-events; send_portfolio_event() → portfolio-events
    consumer.py                        # Kafka loop → MovingAverageService
    anomaly_consumer.py                # Kafka loop → AnomalyDetector
  models/
    price_points.py                    # PricePoint — partitioned by month
    polling_jobs.py                    # PollingJob — symbol, provider, interval, status
    raw_market_data.py                 # RawMarketData — raw JSON from external APIs
    moving_average.py                  # MovingAverage — 5-pt MA
    alerts.py                          # Alert — anomaly_type, severity, z_score, fast_ma, slow_ma
    portfolio.py                       # Portfolio — id, name, portfolio_type (stock|crypto), created_at
    position.py                        # Position — portfolio_id FK, symbol, provider, quantity, avg_cost_basis
  schemas/
    price.py                           # PriceResponse
    poll.py                            # PollingRequest / PollingResponse
    alerts.py                          # AlertResponse
    portfolio.py                       # CreatePortfolioRequest (portfolio_type), PortfolioResponse,
                                       # AddPositionRequest, PositionResponse, PortfolioSnapshot,
                                       # PortfolioAnalysisResponse, AskQuestionRequest/Response
    analytics.py                       # IndicatorResponse, RiskResponse, MACDSchema, BollingerSchema
  services/
    price_service.py                   # PriceService — 3-tier fetch orchestrator (per-request, not singleton)
    polling_worker_service.py          # polling_worker() — background task, PriceService per job
    moving_average_service.py          # 5-pt MA calc + dedup persistence
    anomaly_detector.py                # Z-score (N=20, 3σ/4σ) + MA divergence (0.5%)
    ai_insights.py                     # AIInsightsService — claude-sonnet-4-6, Redis 5 min cache
    portfolio_service.py               # create/delete portfolio, add_or_update/close position, get_snapshot
    technical_analysis.py              # RSI (14), MACD (12/26/9 EMA), Bollinger Bands (20, 2σ)
    signal_generator.py                # RSI/MACD/Bollinger voting → BUY/SELL/HOLD + confidence
    risk_engine.py                     # Parametric VaR (95%), Sharpe, max drawdown, correlation matrix
    portfolio_intelligence.py          # Full-context Claude analyst report, Redis 5 min cache
    market_qa.py                       # Claude tool-use Q&A loop, Redis 2 min cache
    providers/
      base.py                          # BaseProvider ABC + PriceFetchResult dataclass
      finnhub.py                       # FinnhubProvider — stocks
      alpha_vantage.py                 # AlphaVantageProvider — stocks (alternative)
      binance.py                       # BinanceProvider — crypto via api.binance.us (no key)
      registry.py                      # get_provider(name) → BaseProvider instance
  prompts/
    portfolio_analysis.py              # build_analysis_prompt(), build_qa_system_prompt(), build_qa_user_prompt()

frontend/
  src/
    pages/
      Dashboard.tsx                    # Aggregates all portfolios; combined P&L + chart
      Markets.tsx                      # 25 default stocks, sparklines, signals, search/track
      Crypto.tsx                       # 20 default coins via Binance US, 15s refresh, orange theme
      Portfolio.tsx                    # Multi-portfolio (stock + crypto types), switcher, risk panel
      Analytics.tsx                    # RSI gauge, MACD, Bollinger chart; Stocks/Crypto toggle
      Alerts.tsx                       # Anomaly alerts, resolve, add to portfolio
      AIInsights.tsx                   # Claude per-symbol summaries
      Docs.tsx                         # Guide (rendered from /guide endpoint)
    components/
      layout/Sidebar.tsx               # Nav: Dashboard, Markets, Crypto, Portfolio, Analytics, Alerts, AI Insights, Guide
      ui/AddToPortfolioModal.tsx        # Reusable modal — symbol + price + qty → addPosition()
      3d/ParticleField.tsx             # Three.js animated background
    api/client.ts                      # All API calls (axios, baseURL: '/')
    types/index.ts                     # Shared TypeScript interfaces
  vite.config.ts                       # Proxy: /prices /portfolios /analytics /alerts /insights
                                       #        /health /ws /guide /demo → localhost:8000

scripts/
  run_ma_consumer.py                   # Entry point for ma-consumer container
  run_anomaly_consumer.py              # Entry point for anomaly-consumer container
  seed_demo_data.py                    # One-shot demo data seeder (marketdata-seed container)

docker/
  docker-compose.yml                   # All 11 containers
  entrypoint.sh                        # Waits for Postgres → alembic upgrade head → uvicorn
  init-scripts/kafka-init.sh           # One-shot: creates price-events topic

alembic-migrations/
  versions/                            # Applied in order on startup
```

---

## Architecture — Key Design Decisions

- **Provider abstraction (OCP)** — `BaseProvider` ABC. Add a provider: subclass it, register one line in `registry.py`. Nothing else changes.
- **PriceService is per-request** — db session is request-scoped. Never make it a singleton.
- **Async SQLAlchemy** for API + polling worker. Sync `SessionLocal` kept for MA consumer (confluent_kafka is blocking).
- **Async Redis** — `redis.asyncio.Redis`. Cache key: `{symbol.lower()}:{provider}`.
- **confluent_kafka** for producer and MA/anomaly consumers (sync, separate containers). **aiokafka** for the Kafka broadcaster (runs inside FastAPI's asyncio event loop).
- **ConnectionManager is a module-level singleton** — shared between `stream.py` and `kafka_broadcaster.py`.
- **delete_portfolio() hard-deletes positions** — FK constraint requires it. Uses `DELETE FROM positions WHERE portfolio_id = ?` first.
- **MarketQAService uses Claude tool use** — agentic loop: send → if `stop_reason == "tool_use"` execute tools → repeat → return final text.
- **Binance US, not .com** — `api.binance.com` returns HTTP 451 (geo-blocked in the US). Always use `api.binance.us`. Same API, different hostname.
- **Multi-portfolio in localStorage** — portfolios are tracked as `mip_portfolios` (JSON array `[{id, name, type}]`). Active portfolio is `mip_portfolio_id` + `mip_portfolio_name` + `mip_portfolio_type`. Bootstrapped from single keys on first load.
- **Dashboard aggregates all portfolios** — reads all entries from `mip_portfolios`, fetches all snapshots, sums `total_value` and `total_pnl`.
- **Analytics provider toggle** — Analytics page reads `provider` from `location.state` (passed by Markets/Crypto nav). Stocks default to `finnhub`, crypto to `binance`.

---

## Database Schema

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `polling_jobs` | symbol, provider, interval, status, last_polled_at | Drives background polling |
| `raw_market_data` | id (UUID), symbol, provider, raw_json, timestamp | Raw API responses |
| `price_points` | id (UUID), symbol, price, timestamp, provider, raw_data_id (FK) | Partitioned by month (RANGE on timestamp). PK is `(id, timestamp)`. |
| `moving_average` | symbol, average_price, interval=5, provider, timestamp | 5-pt MA, deduped by timestamp |
| `alerts` | id, symbol, anomaly_type, severity, price, z_score, fast_ma, slow_ma, resolved | Uses `alertseverity` + `anomalytype` Postgres enums |
| `portfolios` | id (UUID), name, portfolio_type (stock\|crypto), created_at | |
| `positions` | id (UUID), portfolio_id (FK), symbol, provider, quantity, avg_cost_basis, is_active | |

**Partitioning:** monthly RANGE on `price_points(timestamp)`. Partitions: 2026-03 through 2027-12 + `price_points_future`.

**Migration gotcha:** Never use `op.create_table()` with Enum columns — SQLAlchemy ignores `create_type=False` and emits a second `CREATE TYPE`, causing `DuplicateObject` errors. Always use raw `op.execute()` SQL.

---

## Environment Variables

```
DATABASE_URL              # postgresql://user:pass@host:port/db (sync format)
ALPHA_VANTAGE_API_KEY
FINNHUB_API_KEY
ANTHROPIC_API_KEY
REDIS_HOST
REDIS_PORT
REDIS_URL
DB_PRICE_TTL              # Cache/DB freshness window in seconds (default 60)
KAFKA_BOOTSTRAP_SERVERS
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
```

---

## Docker Services

| Container | Port | Role |
|-----------|------|------|
| `marketdata-api` | 8000 | FastAPI + uvicorn |
| `marketdata-frontend` | 3000 | React + Vite |
| `marketdata-seed` | — | One-shot demo data seeder |
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
# Start everything
docker compose -f docker/docker-compose.yml --env-file .env up --build

# Rebuild single service
docker compose -f docker/docker-compose.yml --env-file .env up --build api
docker compose -f docker/docker-compose.yml --env-file .env up --build frontend

# Logs (service keys use underscore, container names use hyphen)
docker compose -f docker/docker-compose.yml logs -f marketdata-api
docker compose -f docker/docker-compose.yml logs -f ma_consumer
docker compose -f docker/docker-compose.yml logs -f anomaly_consumer

# Migrations
docker exec -it marketdata-api alembic upgrade head
docker exec -it marketdata-api alembic revision --autogenerate -m "description"

# Test endpoints
curl "http://localhost:8000/prices/latest?symbol=AAPL&provider=finnhub"
curl "http://localhost:8000/prices/latest?symbol=BTC&provider=binance"

# DB
docker exec postgres psql -U postgres -d marketdata -c "SELECT * FROM price_points LIMIT 5;"
docker exec postgres psql -U postgres -d marketdata -c "\d+ price_points"

# Wipe everything
docker compose -f docker/docker-compose.yml down -v
```

---

## Gotchas

- **Never add logic to `consumer.py`** — it owns the Kafka loop only. Business logic goes in a service class.
- **Never import `settings` inside a provider class body** — keys are injected via constructor from `registry.py`.
- **PriceService is not a singleton** — instantiate per request/job tick with the correct `db` session.
- **MA consumer uses sync session** — `SessionLocal`, not `AsyncSessionLocal`. confluent_kafka's poll loop is blocking.
- **price_points PK is `(id, timestamp)`** — always include `timestamp` in queries; partition key must be in every unique constraint.
- **`--env-file .env` is required** — compose file is in `docker/`, not at root.
- **`anomaly_consumer` vs `anomaly-consumer`** — service key uses underscore; container name uses hyphen. `docker compose logs` takes the service key.
- **`pnl_pct` is a ratio, not a percentage** — `portfolio_service.get_snapshot()` returns e.g. `0.389`. Frontend multiplies by 100 for display.
- **`DELETE /prices/poll/{job_id}` hard-deletes the row** — polling worker picks up jobs from DB; delete stops it permanently.
- **Binance US, not .com** — `api.binance.com` → HTTP 451 (geo-blocked in the US). Use `api.binance.us`.
- **Crypto signals need data to accumulate** — RSI requires 14 price points, MACD requires 26. At 15s interval, allow ~3-7 minutes after container start before indicators are available.
- **Multi-portfolio localStorage** — `mip_portfolios` is the source of truth for the portfolio list. It bootstraps from `mip_portfolio_id`/`mip_portfolio_name` on first load for backwards compatibility.
- **Never use `op.create_table()` with Enum columns** — use raw `op.execute()` SQL instead.
