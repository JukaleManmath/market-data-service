# Market Data Service — Portfolio Intelligence Platform

> Real-time financial data pipeline with Kafka streaming, partitioned PostgreSQL, and Redis caching. Extended into a full Portfolio Intelligence Platform with a React frontend, technical analysis (RSI, MACD, Bollinger Bands), portfolio risk metrics (VaR, Sharpe, max drawdown), crypto support via Binance US, and Claude-powered natural language portfolio Q&A.

---

## Prerequisites

- Docker 20.0+
- Docker Compose 2.0+
- Finnhub API key (free tier works)
- Anthropic API key

## Quick Start

```bash
git clone https://github.com/JukaleManmath/market-data-service.git
cd market-data-service
cp .env.example .env   # fill in API keys and DB credentials
docker compose -f docker/docker-compose.yml --env-file .env up --build
```

> **Note:** `--env-file .env` is required — the compose file lives in `docker/`, so Docker Compose won't find the root `.env` automatically.

Migrations run automatically on startup. The API seeds 25 stock polling jobs (Finnhub, 60s interval) and 20 crypto polling jobs (Binance US, 15s interval) on first boot.

## Access

| Service | URL |
|---------|-----|
| React Frontend | http://localhost:3000 |
| API + Swagger | http://localhost:8000/docs |
| Database Admin | http://localhost:8080 (Adminer) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (3000)                    │
│   Dashboard · Markets · Crypto · Portfolio · Analytics ·    │
│              Alerts · AI Insights · Guide                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                   FastAPI (Port 8000)                        │
│         RequestID Middleware · JSON structured logs          │
│                                                              │
│  /prices  /portfolios  /analytics  /insights  /alerts       │
│  /health  /guide  /demo  /ws/prices/{symbol}                │
└──────┬───────────────────────────────────────────────────────┘
       │
       ├──────────────┬───────────────┐
       ▼              ▼               ▼
┌───────────┐  ┌────────────┐  ┌──────────────────┐
│   Redis   │  │ PostgreSQL │  │  External APIs   │
│  (cache)  │  │ partitioned│  │ Finnhub · Binance│
│           │  │  by month  │  │ · Alpha Vantage  │
└───────────┘  └─────┬──────┘  └──────────────────┘
                     │
         ┌───────────┼───────────────────┐
         ▼           ▼                   ▼
    ┌─────────┐  ┌────────────┐  ┌──────────────────┐
    │   MA    │  │  Anomaly   │  │Kafka Broadcaster │
    │Consumer │  │  Consumer  │  │→ WebSocket push  │
    │(5-pt MA)│  │(z-score +  │  └──────────────────┘
    └─────────┘  │ MA cross.) │
                 └─────┬──────┘
                       ▼
                ┌─────────────┐
                │ Claude API  │
                │ portfolio   │
                │ Q&A + regime│
                │ detection   │
                └─────────────┘
```

### PriceService 3-tier lookup

```
PriceService.get_latest_price(symbol)
  ├── Redis cache         (TTL = DB_PRICE_TTL seconds)
  ├── PostgreSQL          (recent price points)
  └── External API        (Finnhub / Binance US / Alpha Vantage)
        ├── persist()     → RawMarketData + PricePoint
        ├── cache write   → Redis
        └── Kafka publish → price-events topic
```

### Adding a new price provider (OCP)

1. Create `app/services/providers/<name>.py` — subclass `BaseProvider`, implement `name` and `fetch()`
2. Register it in `app/services/providers/registry.py` — nothing else changes

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/prices/latest` | Current price — Redis → DB → provider |
| GET | `/prices/history` | Price history for a symbol |
| POST | `/prices/poll` | Create a periodic polling job |
| DELETE | `/prices/poll/{job_id}` | Stop and remove a polling job |
| GET | `/health` | PostgreSQL + Redis health check |
| GET | `/alerts/active` | Active anomaly alerts |
| POST | `/alerts/{id}/resolve` | Resolve an alert |
| GET | `/insights/{symbol}` | Claude summary for one symbol (Redis 5 min cache) |
| POST | `/portfolios` | Create portfolio (type: stock \| crypto) |
| DELETE | `/portfolios/{id}` | Delete portfolio and all positions |
| GET | `/portfolios/{id}/snapshot` | Live P&L snapshot |
| POST | `/portfolios/{id}/positions` | Add / update position (weighted avg cost basis) |
| DELETE | `/portfolios/{id}/positions/{pos_id}` | Close a position |
| GET | `/portfolios/{id}/analysis` | Claude analyst report (Redis 5 min cache) |
| POST | `/portfolios/{id}/ask` | Natural language Q&A via Claude tool use (Redis 2 min cache) |
| GET | `/analytics/{symbol}/indicators` | RSI, MACD, Bollinger Bands + BUY/SELL/HOLD signal |
| GET | `/analytics/portfolios/{id}/risk` | VaR (95%), Sharpe, max drawdown, correlation matrix |
| WS | `/ws/prices/{symbol}` | Real-time price stream |
| GET | `/guide` | Interactive documentation data |

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

## Development Commands

```bash
# Start (detached)
docker compose -f docker/docker-compose.yml --env-file .env up -d

# Rebuild a single service
docker compose -f docker/docker-compose.yml --env-file .env up --build api
docker compose -f docker/docker-compose.yml --env-file .env up --build frontend

# View logs
docker compose -f docker/docker-compose.yml logs -f marketdata-api
docker compose -f docker/docker-compose.yml logs -f ma_consumer
docker compose -f docker/docker-compose.yml logs -f anomaly_consumer

# Stop
docker compose -f docker/docker-compose.yml down

# Stop + wipe volumes (clean slate)
docker compose -f docker/docker-compose.yml down -v

# Run migrations manually
docker exec -it marketdata-api alembic upgrade head

# Generate a new migration
docker exec -it marketdata-api alembic revision --autogenerate -m "description"

# Verify stock price
curl "http://localhost:8000/prices/latest?symbol=AAPL&provider=finnhub"

# Verify crypto price
curl "http://localhost:8000/prices/latest?symbol=BTC&provider=binance"

# Check DB partitions
docker exec postgres psql -U postgres -d marketdata -c "\d+ price_points"
```

---

## Environment Variables

```
DATABASE_URL              # postgresql://user:pass@host:port/db
ALPHA_VANTAGE_API_KEY
FINNHUB_API_KEY
ANTHROPIC_API_KEY
REDIS_HOST
REDIS_PORT
REDIS_URL
DB_PRICE_TTL              # Freshness window in seconds (default 60)
KAFKA_BOOTSTRAP_SERVERS
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
```

---

## Key Files

| File | Role |
|------|------|
| `app/services/providers/base.py` | `BaseProvider` ABC — extend to add a new data source |
| `app/services/providers/registry.py` | Single place to register providers (OCP) |
| `app/services/providers/binance.py` | Binance US provider — crypto prices, no API key |
| `app/services/price_service.py` | 3-tier fetch orchestrator (Redis → DB → API) |
| `app/services/portfolio_service.py` | Portfolio CRUD, live P&L snapshot, position management |
| `app/services/technical_analysis.py` | RSI (14), MACD (12/26/9 EMA), Bollinger Bands (20, 2σ) |
| `app/services/signal_generator.py` | BUY/SELL/HOLD voting across RSI + MACD + Bollinger |
| `app/services/risk_engine.py` | Parametric VaR (95%), Sharpe, max drawdown, correlation matrix |
| `app/services/portfolio_intelligence.py` | Full-context Claude analyst report, Redis 5 min cache |
| `app/services/market_qa.py` | Claude tool-use agentic Q&A loop, Redis 2 min cache |
| `app/prompts/portfolio_analysis.py` | Prompt builders — versioned separately from services |
| `app/core/websocket_manager.py` | In-memory pub/sub registry for WebSocket connections |
| `app/core/kafka_broadcaster.py` | aiokafka consumer → WebSocket broadcast |
| `docker/docker-compose.yml` | All containers |
| `frontend/src/pages/` | React pages: Dashboard, Markets, Crypto, Portfolio, Analytics, Alerts, AIInsights, Docs |
