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
| GET | `/health` | 4 | PostgreSQL + Redis health check |
| GET | `/alerts/active` | 3 | Active anomaly alerts |
| POST | `/alerts/{id}/resolve` | 3 | Resolve an alert |
| GET | `/insights/{symbol}` | 3 | Claude summary for one symbol |
| POST | `/portfolios` | 5 | Create portfolio |
| GET | `/portfolios/{id}/snapshot` | 5 | Live P&L (uses Redis prices) |
| POST | `/portfolios/{id}/positions` | 5 | Add/update position |
| DELETE | `/portfolios/{id}/positions/{sym}` | 5 | Close position |
| GET | `/portfolios/{id}/history` | 5 | Historical P&L (last N days) |
| GET | `/portfolios/{id}/risk` | 6 | VaR, Sharpe, beta, max drawdown |
| GET | `/portfolios/{id}/correlation` | 6 | Correlation matrix (heatmap-ready JSON) |
| GET | `/analytics/{symbol}/indicators` | 6 | RSI, MACD, Bollinger Bands |
| GET | `/analytics/{symbol}/signals` | 6 | Composite BUY/SELL/HOLD signal |
| WS | `/ws/prices/{symbol}` | 7 | Real-time price stream (WebSocket) |
| GET | `/portfolios/{id}/analysis` | 8 | Claude full portfolio analysis |
| POST | `/portfolios/{id}/ask` | 8 | Natural language Q&A |
| GET | `/market/regime` | 8 | Market regime (risk-on/off/neutral) |
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

### Phase 2 — Performance & Partitioning (Resume Match)

**Goal:** PostgreSQL table partitioning, async SQLAlchemy, Kafka throughput tuning, async Redis.

**2a — PostgreSQL Partitioning** (`alembic-migrations/versions/xxxx_partition_price_points.py`):
- Rename `price_points` → `price_points_old`
- Recreate as `PARTITION BY RANGE (timestamp)` with composite PK `(id, timestamp)`
- Create monthly child partitions 2024–2026 + catch-all `price_points_future`
- Migrate data, create `idx_price_points_symbol_ts (symbol, timestamp DESC)`, drop old table
- Update `app/models/price_points.py`: add `postgresql_partition_by` table arg

> Always include a timestamp filter in queries — otherwise PostgreSQL scans all partitions.

**2b — Async SQLAlchemy** (`app/database/session.py`):
- Add `asyncpg`, `sqlalchemy[asyncio]` to requirements
- Rewrite session to `create_async_engine` + `AsyncSession`
- Keep `session_sync.py` (old sync engine) for the MA consumer (confluent-kafka is sync)
- Update all DB-touching files to `await db.execute(select(...))`, `await db.commit()`

**2c — Kafka tuning** (`app/kafka/producer.py`):
```python
'batch.size': 65536, 'linger.ms': 5, 'compression.type': 'lz4'
```
Replace `producer.flush()` per message with `producer.poll(0)`. Flush once on app shutdown.
Increase `price-events` to 6 partitions. Add `anomaly-events` (3p) and `portfolio-events` (3p).

**2d — Async Redis** (`app/core/redis.py`):
Switch to `redis.asyncio`. Improve key namespacing: `price:{SYMBOL}:{provider}`.

```bash
# Verify partitioning
docker exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\d+ price_points"
# → Partition key: RANGE (timestamp)
```

---

### Phase 3 — Anomaly Detection + Claude Symbol Insights

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

---

### Phase 4 — Observability

| File | Purpose |
|------|---------|
| `app/core/logging.py` | `JSONFormatter` + `setup_logging()` — structured `{timestamp, level, request_id, message}` |
| `app/middleware/request_id.py` | UUID per request, propagated as `X-Request-ID` response header |
| `app/api/health.py` | `GET /health` — `SELECT 1` + Redis `PING` → `{status, checks}` |

Register all three in `app/main.py`.

---

### Phase 5 — Portfolio Management Layer

**Goal:** Users define holdings, track live P&L, see position weights. Gives every downstream feature (AI, alerts, risk) the portfolio context it needs.

New models (`alembic-migrations/versions/xxxx_add_portfolio_tables.py`):
- `Portfolio` — id, name, owner_id, created_at
- `Position` — id, portfolio_id, symbol, quantity, avg_cost_basis, opened_at, closed_at, is_active

**`app/services/portfolio_service.py`** — core logic:
- `get_portfolio_snapshot()` — fetches current prices from Redis, computes market_value, unrealized_pnl, pnl_pct, weight per position
- `update_position()` — weighted average cost basis on each buy
- `close_position()` — records realized P&L

On any position change, publish to `portfolio-events` Kafka topic so Phase 6 risk engine can react.

```bash
curl -X POST http://localhost:8000/portfolios -d '{"name":"Tech Portfolio"}'
curl -X POST http://localhost:8000/portfolios/1/positions -d '{"symbol":"AAPL","quantity":100,"price":175.00}'
curl http://localhost:8000/portfolios/1/snapshot
# → {total_value, total_pnl, positions: [{symbol, current_price, pnl, weight}]}
```

---

### Phase 6 — Technical Analysis & Risk Metrics

**Goal:** Full indicator suite (RSI, MACD, Bollinger Bands) + portfolio-level risk (VaR, Sharpe, correlation matrix).

**`app/services/technical_analysis.py`** — computed from `price_points` table:

| Indicator | Lookback | Notes |
|-----------|----------|-------|
| RSI | 14 periods | RS = avg_gain/avg_loss |
| MACD | 12/26/9 EMA | Line, signal, histogram |
| Bollinger Bands | 20 periods, 2σ | Upper, middle, lower band |

> Since we only have `price` (no OHLCV), ATR uses `abs(price[i] - price[i-1])` as true range approximation. Documented in service docstring.

**`app/services/risk_engine.py`** — requires 30+ days of history, uses `numpy` + `scipy`:
```python
# 1. Fetch price series for each position
# 2. Compute daily log returns per symbol
# 3. Build covariance matrix
# 4. Portfolio variance = w.T @ cov_matrix @ w
# 5. Parametric VaR = portfolio_value * z_score * sqrt(variance)
# 6. Sharpe = (mean_return - risk_free_rate) / std_return * sqrt(252)
# 7. Max drawdown = (peak - trough) / peak over lookback window
```

**`app/services/signal_generator.py`** — composite signal:
- RSI > 70 → overbought, RSI < 30 → oversold
- MACD line crosses signal → momentum shift
- Price near Bollinger upper → potential reversal
- Output: `{signal: "BUY|SELL|HOLD", confidence: 0–1, reasons: [...]}`

Add `numpy`, `scipy` to requirements.txt.

```bash
curl "http://localhost:8000/analytics/AAPL/indicators"
# → {rsi: 58.3, macd: {line: 2.1, signal: 1.8, histogram: 0.3}, bollinger: {...}}

curl "http://localhost:8000/portfolios/1/risk"
# → {VaR_1day: 1250.00, sharpe: 1.34, max_drawdown: -0.12, correlation_matrix: {...}}
```

---

### Phase 7 — Real-time WebSocket Streaming

**Goal:** Push price ticks to subscribers instantly via WebSocket instead of REST polling.

**`app/core/websocket_manager.py`**:
```python
class ConnectionManager:
    connections: dict[str, list[WebSocket]]  # symbol → connected sockets
    async def subscribe(symbol, ws)
    async def broadcast(symbol, message)
```

**`app/core/kafka_broadcaster.py`** — background asyncio task (started in `main.py` lifespan):
- Uses `aiokafka` (async Kafka consumer) to read `price-events`
- On each message: `await manager.broadcast(symbol, enriched_data)`

**`app/api/stream.py`** — `WS /ws/prices/{symbol}`

Message pushed to clients:
```json
{
  "symbol": "AAPL", "price": 178.42, "timestamp": "...",
  "moving_average_5": 177.91, "signal": "HOLD"
}
```

Add `aiokafka` to requirements.txt.

```bash
# Test with wscat (npm install -g wscat)
wscat -c "ws://localhost:8000/ws/prices/AAPL"
# → Receives a message every time AAPL is polled
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
Phase 3  →  8 new files + 1 mig     →  anomaly detection + per-symbol Claude
Phase 4  →  3 new files + 1 edit    →  structured logs, health, request IDs
Phase 5  →  4 new files + 1 mig     →  portfolio management, live P&L tracking
Phase 6  →  4 new files             →  RSI/MACD/BB, VaR, Sharpe, correlations
Phase 7  →  3 new files + 1 edit    →  WebSocket real-time price streaming
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
| `app/services/risk_engine.py` | Phase 6 core — numpy VaR/Sharpe |
| `app/core/websocket_manager.py` | Phase 7 core — in-memory pub/sub |
| `app/services/portfolio_intelligence.py` | Phase 8 core — Claude context builder |
| `docker/docker-compose.yml` | Updated each phase |
