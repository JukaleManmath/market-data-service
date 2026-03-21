# Market Data Service — Portfolio Intelligence Platform

> Real-time financial data pipeline using Kafka streaming and FastAPI, with PostgreSQL table partitioning and Redis caching, processing 100K+ events/min at sub-200ms latency while cutting database load by 75%.
>
> Extended into a full **Portfolio Intelligence Platform** with technical analysis, risk metrics (VaR, Sharpe), WebSocket streaming, and Claude-powered natural language portfolio Q&A.

---

## Prerequisites

- **Docker** (version 20.0 or higher)
- **Docker Compose** (version 2.0 or higher)

## Quick Start

```bash
git clone https://github.com/your-username/market-data-service.git
cd market-data-service
cp .env.example .env   # fill in your API keys and DB credentials
docker compose -f docker/docker-compose.yml --env-file .env up --build
```

This will build all images, start all containers, and apply database migrations automatically.

> **Note:** The `--env-file .env` flag is required because the compose file lives in `docker/` — without it, Docker Compose won't find the `.env` at the project root.

## Dashboard

![Dashboard](docs/images/Dashboard.png)

## Service Access Points

| Service | URL | Purpose |
|---------|-----|---------|
| API + Swagger | http://localhost:8000/docs | REST API + interactive docs |
| Database Admin | http://localhost:8080 | Adminer (PostgreSQL UI) |
| Grafana | http://localhost:3000 | Metrics dashboards |
| Prometheus | http://localhost:9090 | Raw metrics scraper |
| PostgreSQL | localhost:5433 | Direct DB access |
| Redis | localhost:6379 | Cache |
| Kafka | localhost:9092 | Message broker |

## Development Commands

```bash
# Start detached
docker compose -f docker/docker-compose.yml --env-file .env up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f marketdata-api
docker compose -f docker/docker-compose.yml logs -f ma-consumer

# Stop
docker compose -f docker/docker-compose.yml down

# Stop + wipe volumes (clean slate)
docker compose -f docker/docker-compose.yml down -v

# Run migrations manually
docker exec -it marketdata-api alembic upgrade head

# Test price fetch
curl "http://localhost:8000/prices/latest?symbol=AAPL&provider=finnhub"

# Create a polling job
curl -X POST http://localhost:8000/prices/poll \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["AAPL", "NVDA"], "interval": 30, "provider": "finnhub"}'
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Clients                                      │
│   REST API   WebSocket (/ws/prices/{symbol})   Grafana Dashboard    │
└──────┬───────────────┬──────────────────────────────┬──────────────┘
       │               │                              │
┌──────▼───────────────▼──────────────────────────────▼──────────────┐
│                     FastAPI (Port 8000)                             │
│  Auth Middleware → Rate Limiter → Request ID → JSON Logger          │
│                                                                     │
│  /prices  /portfolios  /analytics  /intelligence  /health  /ws     │
└──────┬──────────────────────────────────────────────────────────────┘
       │
       ├──────────────────┐
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│   Redis      │    │ PostgreSQL  │
│  cache +    │    │ partitioned │
│  rate limit │    │  by month   │
└─────────────┘    └─────────────┘
                          ▲
┌─────────────────────────┼────────────────────────────┐
│              Kafka Topics                             │
│  price-events (6p)  anomaly-events (3p)  portfolio-  │
│                     events (3p)                      │
└──────┬──────────────────┬───────────────────────────┘
       │                  │
       ▼                  ▼
┌─────────────┐    ┌─────────────────┐    ┌───────────────────┐
│ MA Consumer │    │ Anomaly Consumer│    │ Kafka Broadcaster │
│ (5-pt MA)   │    │ (z-score +      │    │ → WebSocket push  │
│             │    │  MA crossover)  │    │                   │
└─────────────┘    └────────┬────────┘    └───────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │   Claude API     │
                   │ portfolio Q&A,  │
                   │ regime detect,  │
                   │ anomaly explain │
                   └─────────────────┘
```

---

## Full API Reference

| Method | Endpoint | Phase | Description |
|--------|----------|-------|-------------|
| GET | `/prices/latest` | 1 | Fetch current price (Redis → DB → API) |
| POST | `/prices/poll` | 1 | Create periodic polling job |
| DELETE | `/prices/poll/{job_id}` | 7 | Stop and delete a polling job |
| GET | `/health` | 4 | PostgreSQL + Redis health check |
| GET | `/alerts/active` | 3 | Active anomaly alerts (symbol/provider optional) |
| POST | `/alerts/{id}/resolve` | 3 | Resolve an alert |
| GET | `/insights/{symbol}` | 3 | Claude summary for one symbol (cached 5 min) |
| POST | `/portfolios` | 5 | Create portfolio |
| DELETE | `/portfolios/{id}` | 7 | Delete portfolio and all its positions |
| GET | `/portfolios/{id}/snapshot` | 5 | Live P&L snapshot (uses Redis prices) |
| POST | `/portfolios/{id}/positions` | 5 | Add/update position (weighted avg cost basis) |
| DELETE | `/portfolios/{id}/positions/{pos_id}` | 5 | Close a position |
| GET | `/analytics/{symbol}/indicators` | 6 | RSI, MACD, Bollinger Bands + BUY/SELL/HOLD signal |
| GET | `/analytics/portfolios/{id}/risk` | 6 | VaR, Sharpe, max drawdown, correlation matrix |
| WS | `/ws/prices/{symbol}` | 7 | Real-time price stream (WebSocket) |
| GET | `/ui` | 7 | Terminal dashboard (StaticFiles) |
| GET | `/portfolios/{id}/analysis` | 8 | Claude full portfolio analysis |
| POST | `/portfolios/{id}/ask` | 8 | Natural language Q&A |
| GET | `/metrics` | 9 | Prometheus metrics scrape |

---

## Build Plan

### Phase 1 — Bug Fixes + OOP/SOLID Refactor ✅


**Goal:** Correct running service with clean, extensible architecture.

**Bugs fixed:**

| File | Fix |
|------|-----|
| `app/kafka/consumer.py` | Wrapped module-level code into `start_consumer()`. Replaced hardcoded `'kafka:9092'` with `settings.kafka_bootstrap_servers`. |
| `app/services/polling_worker_service.py` | Fixed `timestamp=datetime.fromisoformat(data["timestamp"])`. Removed duplicate `PricePoint` write. |
| `app/services/price_service.py` | Fixed duplicate `RawMarketData` write — `_persist()` always writes both records atomically. |

**Refactor applied (SOLID):**

| New file | Purpose |
|----------|---------|
| `app/services/providers/base.py` | `BaseProvider` ABC + `PriceFetchResult` dataclass |
| `app/services/providers/finnhub.py` | `FinnhubProvider(BaseProvider)` |
| `app/services/providers/alpha_vantage.py` | `AlphaVantageProvider(BaseProvider)` |
| `app/services/providers/registry.py` | `get_provider(name)` — only place that changes when adding a provider |
| `app/services/price_service.py` | 3-tier fetch orchestrator with injected dependencies |
| `app/services/moving_average_service.py` | MA computation, fully decoupled from Kafka |

```bash
# Verify
curl "http://localhost:8000/prices/latest?symbol=AAPL&provider=finnhub"
docker compose -f docker/docker-compose.yml logs ma-consumer | grep "MA Consumer started"
```

---

### Phase 2 — Performance & Partitioning ✅

**Goal:** PostgreSQL table partitioning, async SQLAlchemy, async Redis, Kafka reliability tuning.

**2a — PostgreSQL Partitioning** (`alembic-migrations/versions/b1c3e5f7a9d2_partition_price_points_by_month.py`):
- Drop flat `price_points` (no historical data to migrate)
- Recreate as `PARTITION BY RANGE (timestamp)` with composite PK `(id, timestamp)`
- Create monthly child partitions 2026-03 through 2027-12 + catch-all `price_points_future`
- Add `idx_price_points_symbol_ts (symbol, timestamp DESC)` on the parent
- Update `app/models/price_points.py`: add `postgresql_partition_by` table arg

**2b — Async SQLAlchemy** (`app/database/session.py`):
- Add `asyncpg`, `sqlalchemy[asyncio]` to requirements
- Add `create_async_engine` + `AsyncSessionLocal` + `get_async_db()` alongside the existing sync session
- Sync `SessionLocal` kept — MA consumer uses confluent_kafka which is blocking
- All API routes and polling worker updated to `await db.execute(select(...))`, `await db.commit()`

**2c — Async Redis** (`app/core/redis.py`):
- Swap `redis.Redis` → `redis.asyncio.Redis` (same package, same API, add `await`)
- `_get_from_cache` and `_write_to_cache` in `PriceService` become async

**2d — Kafka tuning** (`app/kafka/producer.py`):
- Add `acks="all"` and `retries=5` — no silent message loss on transient failures
- Remove `producer.flush()` from `send_price_event` — was blocking the event loop on every message
- Add graceful `producer.flush(timeout=10)` in `main.py` lifespan shutdown

```bash
# Verify partitioning
docker exec postgres psql -U postgres -d marketdata -c "\d+ price_points"
# → Partition key: RANGE (timestamp), 23 child tables listed

# Verify data lands in current month's partition
docker exec postgres psql -U postgres -d marketdata -c "SELECT COUNT(*) FROM price_points_2026_03;"
```

---

### Phase 3 — Anomaly Detection + Claude Symbol Insights ✅

**Goal:** Z-score and MA crossover anomaly detection → alerts table → Claude narrative per symbol.

New files:

| File | Purpose |
|------|---------|
| `app/models/alerts.py` | `AlertSeverity` (low/medium/high), `AnomalyType` (zscore_spike/drop/ma_crossover) |
| `app/services/anomaly_detector.py` | Z-score (threshold 2.5, 20-pt lookback) + MA crossover |
| `app/services/ai_insights.py` | `claude-sonnet-4-6` — builds prompt from prices + MAs + alerts, cached 5 min |
| `app/kafka/anomaly_consumer.py` | Reads `price-events`, detects anomalies, writes to `anomaly-events` + DB |
| `app/api/insights.py` | `GET /insights/{symbol}` |
| `app/api/alerts.py` | `GET /alerts/active`, `POST /alerts/{id}/resolve` |
| `scripts/run_anomaly_consumer.py` | Entry point for anomaly consumer container |
| `alembic-migrations/versions/xxxx_add_alerts_table.py` | Creates `alerts` table + enums |

Use `anthropic.AsyncAnthropic` — never the sync client (it blocks the event loop).
Add `anomaly_consumer` service to `docker-compose.yml`.
Add `ANTHROPIC_API_KEY` to `app/core/config.py` and `.env.example`.

**Migration gotcha:** `op.create_table()` with `create_type=False` on Enum columns silently emits a second `CREATE TYPE`, causing `DuplicateObject` errors. Use `op.execute()` with raw SQL for the full `CREATE TABLE` instead — same pattern as the partition migration.

```bash
# Verify
curl "http://localhost:8000/alerts/active?symbol=AAPL"
curl "http://localhost:8000/insights/AAPL"
# → Claude summary cached in Redis, alert rows in DB
```

---

### Phase 4 — Observability ✅

| File | Purpose |
|------|---------|
| `app/core/logging.py` | `JSONFormatter` + `setup_logging()` — structured `{timestamp, level, request_id, message}` |
| `app/middleware/request_id.py` | UUID per request, propagated as `X-Request-ID` response header |
| `app/api/health.py` | `GET /health` — `SELECT 1` + Redis `PING` → `{status, checks}` |

Register all three in `app/main.py`.

```bash
# Verify
curl http://localhost:8000/health
# → {"status": "ok", "checks": {"postgres": "ok", "redis": "ok"}}
```

---

### Phase 5 — Portfolio Management Layer

**Goal:** Users define holdings, track live P&L, see position weights. Gives every downstream feature (AI, alerts, risk) the portfolio context it needs.

New models (`alembic-migrations/versions/e5f6a7b8c9d0_add_portfolio_tables.py`):
- `Portfolio` — id, name, created_at
- `Position` — id, portfolio_id, symbol, provider, quantity, avg_cost_basis, opened_at, closed_at, is_active

**`app/services/portfolio_service.py`** — core logic:
- `get_snapshot()` — fetches current prices from Redis (falls back to DB), computes market_value, unrealized_pnl, pnl_pct, weight per position
- `add_or_update_position()` — weighted average cost basis on each buy
- `close_position()` — marks position inactive, sets closed_at

On any position change, publishes to `portfolio-events` Kafka topic so Phase 6 risk engine can react.

```bash
curl -X POST http://localhost:8000/portfolios \
  -H "Content-Type: application/json" -d '{"name":"Tech Portfolio"}'

curl -X POST "http://localhost:8000/portfolios/{id}/positions" \
  -H "Content-Type: application/json" -d '{"symbol":"AAPL","quantity":100,"price":175.00}'

curl "http://localhost:8000/portfolios/{id}/snapshot"
# → {portfolio_id, portfolio_name, total_value, total_pnl, positions: [{symbol, current_price, unrealized_pnl, pnl_pct, weight}]}

curl -X DELETE "http://localhost:8000/portfolios/{id}/positions/{pos_id}"
```

---

### Phase 6 — Technical Analysis & Risk Metrics ✅

**Goal:** Full indicator suite (RSI, MACD, Bollinger Bands) + portfolio-level risk (VaR, Sharpe, correlation matrix).

| File | Purpose |
|------|---------|
| `app/services/technical_analysis.py` | RSI (14-period), MACD (12/26/9 EMA), Bollinger Bands (20-period, 2σ) |
| `app/services/signal_generator.py` | Rule-based voting → BUY/SELL/HOLD + confidence score + reasons list |
| `app/services/risk_engine.py` | Parametric VaR (95%), Sharpe (annualised), max drawdown, correlation matrix |
| `app/api/analytics.py` | Two endpoints wired to the services above |
| `app/schemas/analytics.py` | `IndicatorResponse`, `RiskResponse` |

**`app/services/technical_analysis.py`** — computed from `price_points` table:

| Indicator | Lookback | Notes |
|-----------|----------|-------|
| RSI | 14 periods | RS = avg_gain/avg_loss |
| MACD | 12/26/9 EMA | Line, signal, histogram |
| Bollinger Bands | 20 periods, 2σ | Upper, middle, lower band |

> We only have `price` (no OHLCV). All indicators use close price only. Indicators return `null` when insufficient history exists — minimum 15 for RSI, 20 for Bollinger, 35 for MACD.

**`app/services/risk_engine.py`** — requires 30+ price points per symbol, uses `numpy` + `scipy`:
```
1. Fetch price series for each active position (up to 252 points)
2. Compute daily log returns per symbol
3. Build covariance matrix
4. Portfolio variance = w.T @ cov_matrix @ w
5. Parametric VaR = portfolio_value * z_score * sqrt(variance)   [95% confidence]
6. Sharpe = (mean_return - risk_free_rate) / std_return * sqrt(252)
7. Max drawdown = worst (peak - trough) / peak over the full history
8. Correlation matrix — np.corrcoef, handles single-symbol edge case
```

**`app/services/signal_generator.py`** — rule-based voting:
- RSI < 30 → +1 BUY (oversold), RSI > 70 → +1 SELL (overbought)
- MACD histogram > 0 → +1 BUY (bullish momentum), < 0 → +1 SELL
- Price ≤ lower Bollinger → +1 BUY, price ≥ upper Bollinger → +1 SELL
- Confidence = winning_votes / total_votes_cast. Tie → HOLD.

Added `numpy`, `scipy` to `requirements/requirements.txt`.

```bash
curl "http://localhost:8000/analytics/AAPL/indicators?provider=finnhub"
# → {rsi: 22.19, macd: {line: 0.13, signal: 2.22, histogram: -2.08}, bollinger: {...}, signal: "HOLD", confidence: 0.0, reasons: [...]}

curl "http://localhost:8000/analytics/portfolios/{id}/risk"
# → {var_1day_95: 230.46, sharpe_ratio: 1.34, max_drawdown: -0.06, correlation_matrix: {...}}
```

---

### Phase 7 — Real-time WebSocket Streaming + Terminal Dashboard ✅

**Goal:** Push price ticks to subscribers instantly via WebSocket. Add a terminal-style browser dashboard exposing all API routes without curling endpoints.

New files:

| File | Purpose |
|------|---------|
| `app/core/websocket_manager.py` | `ConnectionManager` — `defaultdict(list)` mapping symbol → connected sockets. `subscribe()`, `unsubscribe()`, `broadcast()`. Module-level singleton `manager`. |
| `app/core/kafka_broadcaster.py` | `start_broadcaster()` — asyncio task using `aiokafka.AIOKafkaConsumer` reading `price-events`, calls `await manager.broadcast()` per message. `group_id="websocket-broadcaster"`, `auto_offset_reset="latest"`. |
| `app/api/stream.py` | `WS /ws/prices/{symbol}` — accepts connection via `manager.subscribe()`, loops on `receive_text()` to keep alive, unsubscribes on disconnect. |
| `app/static/index.html` | Single-file terminal dashboard. Vanilla JS, no framework, no build step. Fixed viewport (no page scroll). Served at `/ui`. |

**`main.py` additions:**
```python
asyncio.create_task(start_broadcaster())   # alongside polling_worker()
app.include_router(stream_router)
app.mount("/ui", StaticFiles(directory="app/static", html=True), name="static")
```

**Dashboard panels** (all 14 routes covered):
- Polling Jobs — `POST /prices/poll`, `DELETE /prices/poll/{job_id}` (× per job tag)
- Price Lookup — `GET /prices/latest`
- Live Prices — `WS /ws/prices/{symbol}`
- Portfolio Manager — `POST /portfolios`, `DELETE /portfolios/{id}`, `POST/DELETE /portfolios/{id}/positions`, `GET /portfolios/{id}/snapshot`
- Active Alerts — `GET /alerts/active`, `POST /alerts/{id}/resolve`
- Technical Indicators — `GET /analytics/{symbol}/indicators`
- Portfolio Risk — `GET /analytics/portfolios/{id}/risk` + Check Data Points button
- Claude Insights — `GET /insights/{symbol}`
- Health dot — `GET /health` (title bar, every 30s)

**Bugs fixed during Phase 7:**

| Bug | Fix |
|-----|-----|
| `DELETE /portfolios/{id}` → 500 FK violation | `delete_portfolio()` now hard-deletes position rows before deleting portfolio |
| Close button broken — empty position ID | Added `position_id: UUID` to `PositionSnapshot` schema and `get_snapshot()` |
| `pnl_pct` 100× too large | Service returns ratio (0.389); dashboard multiplies by 100 for display |
| `GET /alerts/active` → 422 | `symbol` and `provider` query params made optional |

Added `aiokafka` to `requirements/requirements.txt`.

```bash
# Test WebSocket
wscat -c "ws://localhost:8000/ws/prices/AAPL"
# → JSON message every polling interval

# Open dashboard
open http://localhost:8000/ui

# Stop a polling job
curl -X DELETE "http://localhost:8000/prices/poll/{job_id}"
```

---

### Phase 8 — Claude Portfolio Intelligence

**Goal:** Claude analyzes the full portfolio context (P&L, risk, indicators, alerts) and answers natural language questions. Moves from per-symbol summaries to portfolio-aware reasoning.

**`app/services/portfolio_intelligence.py`**:
1. Fetch portfolio snapshot, risk metrics, indicators for each held symbol, active alerts
2. Build structured prompt with all context
3. `await anthropic.AsyncAnthropic().messages.create(model="claude-sonnet-4-6", ...)`
4. Cache result in Redis for 5 minutes

**Prompt structure** (`app/prompts/portfolio_analysis.py`):
```
You are a quantitative portfolio analyst. Given:
- Portfolio snapshot: {snapshot}
- Risk metrics: {VaR, Sharpe, drawdown}
- Technical indicators per symbol: {RSI, MACD, Bollinger}
- Active anomaly alerts: {alerts}
- 7-day price changes: {price_changes}

Provide:
1. A 3-sentence market regime assessment (risk-on/risk-off/neutral)
2. Top 2-3 portfolio risks, citing specific metrics
3. One concrete rebalancing suggestion with quantitative reasoning
4. Plain-English explanation of any active alerts
```

**`app/services/market_qa.py`** — natural language Q&A:
- User sends any question about their portfolio or a symbol
- Service fetches relevant data, builds context, Claude answers
- Cache per `(hash(question), frozenset(symbols))` for 2 min

**Optional — Claude tool use** (makes Claude an active data participant, not just a text generator):
- Tool: `get_price_history(symbol, days)` → your DB
- Tool: `get_technical_indicators(symbol)` → returns RSI/MACD/BB
- Tool: `get_correlation(symbol_a, symbol_b)` → correlation coefficient

```bash
curl http://localhost:8000/portfolios/1/analysis
# → {regime: "risk-off", risks: [...], recommendations: [...], narrative: "..."}

curl -X POST http://localhost:8000/portfolios/1/ask \
  -d '{"question": "Should I reduce my NVDA position given current volatility?"}'
# → {"answer": "NVDA is showing RSI of 74 (overbought territory)..."}
```

---

### Phase 9 — Production Hardening

**Goal:** Rate limiting, API key auth, Prometheus metrics, Grafana dashboards, webhook alerts.

**`app/middleware/rate_limiter.py`** — Redis sliding window (100 req/min per IP). Returns `429` with `Retry-After` header.

**`app/middleware/auth.py`** — API key via `X-API-Key` header. Keys stored hashed in Redis. Exempt: `/health`, `/docs`, `/metrics`.

**`app/core/metrics.py`** — Prometheus counters/histograms via `prometheus-client`:
- `http_request_duration_seconds` (per method/endpoint)
- `kafka_events_total` (per topic/status)
- `redis_cache_hit_ratio`
- `websocket_connections_active`

**`app/services/notification_service.py`** — Webhook on HIGH severity alerts. Slack-compatible payload. 3-attempt exponential backoff. Configurable via `ALERT_WEBHOOK_URLS` env var.

**`docker-compose.yml`** additions:
- `prometheus` (port 9090) — scrapes `/metrics`
- `grafana` (port 3000) — pre-built dashboard with request rate, Kafka throughput, cache hit ratio, WebSocket connections

```bash
# Rate limiting test
for i in $(seq 1 110); do curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/health; done
# → 200×100, then 429s

curl http://localhost:8000/metrics | grep http_request_duration
# Grafana at http://localhost:3000
```

---

## Implementation Order

```
Phase 1  →  2 file edits            →  bugs fixed, service runs correctly
Phase 2  →  ~8 edits + 1 migration  →  partitioned DB, async, tuned Kafka
Phase 3  →  8 new files + 1 mig     →  anomaly detection + per-symbol Claude  ✅
Phase 4  →  3 new files + 1 edit    →  structured logs, health, request IDs  ✅
Phase 5  →  6 new files + 3 edits   →  portfolio management, live P&L tracking  ✅
Phase 6  →  5 new files             →  RSI/MACD/BB, VaR, Sharpe, correlations  ✅
Phase 7  →  3 new files + 3 edits   →  WebSocket real-time streaming + terminal dashboard  ✅
Phase 8  →  3 new files + 1 edit    →  Claude portfolio intelligence + Q&A
Phase 9  →  5 new files + 1 edit    →  rate limiting, auth, Prometheus, webhooks
```

---

## Key Files

| File | Role |
|------|------|
| `app/kafka/consumer.py` | Phase 1 — Kafka loop, delegates to `MovingAverageService` |
| `app/services/polling_worker_service.py` | Phase 1 — background polling, builds `PriceService` per job |
| `app/services/price_service.py` | Phase 1 — 3-tier fetch orchestrator (Redis → DB → API) |
| `app/services/providers/base.py` | Phase 1 — `BaseProvider` ABC, extend to add new data source |
| `app/services/providers/registry.py` | Phase 1 — single place to register providers |
| `app/services/moving_average_service.py` | Phase 1 — MA calc + dedup persistence |
| `app/database/session.py` | Phase 2 core — all DB files depend on it |
| `app/services/portfolio_service.py` | Phase 5 core — all portfolio logic |
| `app/services/technical_analysis.py` | Phase 6 — RSI, MACD, Bollinger Bands |
| `app/services/signal_generator.py` | Phase 6 — BUY/SELL/HOLD voting logic |
| `app/services/risk_engine.py` | Phase 6 core — numpy VaR/Sharpe/drawdown/correlation |
| `app/core/websocket_manager.py` | Phase 7 core — in-memory pub/sub |
| `app/services/portfolio_intelligence.py` | Phase 8 core — Claude context builder |
| `docker/docker-compose.yml` | Updated each phase |
