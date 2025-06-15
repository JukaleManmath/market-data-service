# Service Usage Guide

## Getting Started

This guide covers how to interact with the Market Data Service, including API endpoints, database access, and message broker configuration.

## 1. API Access

### Interactive API Documentation
Once your Docker containers are running, access the interactive API documentation:

```
http://localhost:8000/docs
```

This provides a Swagger UI interface where you can explore all available endpoints and test them directly from your browser.

## 2. API Endpoints

### Get Latest Prices
Retrieve the most recent price data for a specific symbol and provider.

**Endpoint:** `GET /prices/latest`

**Parameters:**
- `symbol` (required): Stock symbol (e.g., "AAPL", "GOOGL")
- `provider` (required): Data provider (e.g., "alphavantage")

**Example Request:**
```http
GET /prices/latest?symbol=AAPL&provider=alphavantage
```

### Configure Price Polling
Set up automated price polling for specific symbols.

**Endpoint:** `POST /prices/poll`

**Request Body:**
```json
{
  "symbol": "AAPL",
  "provider": "alphavantage",
  "interval": "60s"
}
```

**Parameters:**
- `symbol`: Stock symbol to monitor
- `provider`: Data source provider
- `interval`: Polling frequency (e.g. "1m", "5m")

## 3. Database Administration

### Adminer Web Interface
Access the database management interface for direct database operations:

**URL:** `http://localhost:8080`

**Connection Details:**
- **System:** PostgreSQL
- **Server:** `db`
- **Username:** `postgres`
- **Password:** `password`
- **Database:** `marketdata`

### Database Features
- View and edit table data
- Execute custom SQL queries
- Monitor database performance
- Manage database schema

## 4. Message Broker (Kafka)

### Topic Configuration
The service uses Kafka for event-driven architecture:

- **Topic Name:** `price-events`
- **Broker Address:** `kafka:9092`

### Event Types
- Price update events
- Polling job notifications
- System status messages

### Monitoring
Use Kafka tools or the broker's built-in monitoring to track:
- Message throughput
- Consumer lag
- Topic partition status

## 5. Development Tips

### Testing API Endpoints
1. Use the Swagger UI at `/docs` for quick testing
2. Use tools like curl, Postman, or HTTPie for automated testing
3. Check the `/health` endpoint to verify service status

### Monitoring Data Flow
1. Set up polling jobs via the API
2. Monitor Kafka topics for message flow
3. Check database tables for stored data
4. Verify Redis cache for performance optimization

### Troubleshooting
- Check Docker container logs: `docker-compose logs [service-name]`
- Verify database connections through Adminer
- Monitor Kafka consumer group status
- Check Redis cache hit/miss ratios