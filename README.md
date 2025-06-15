# Market Data Service - Setup & Installation

## Prerequisites

Before running the Market Data Service, ensure you have the following installed on your system:

- **Docker** (version 20.0 or higher)
- **Docker Compose** (version 2.0 or higher)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/market-data-service.git
cd market-data-service
```

### 2. Start the Application

Launch all services with the following command:

```bash
docker compose -f docker/docker-compose.yml up --build
```

This command will:
- Build all Docker images
- Start all required containers
- Set up the complete application stack
- Apply database migrations automatically

## Database Migrations

### Automatic Migration
Database migrations are automatically applied during container startup via the entrypoint script. No manual intervention is required for the initial setup.

### Manual Migration (Optional)
If you need to run migrations manually, use the following command:

```bash
docker exec -it marketdata-api alembic upgrade head
```

## Container Architecture

The application consists of the following containers:

### Core Services
- **`marketdata-api`**: FastAPI backend server providing REST API endpoints
- **`ma-consumer`**: Kafka consumer service for processing moving average calculations

### Infrastructure Services
- **`kafka`**: Apache Kafka message broker for event streaming
- **`zookeeper`**: Coordination service required by Kafka
- **`postgres`**: PostgreSQL database for persistent data storage
- **`redis`**: Redis cache for high-performance data retrieval
- **`adminer`**: Web-based database administration interface

## Service Access Points

Once all containers are running, you can access the following services:

### Web Interfaces
- **API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)  
  *Interactive Swagger UI for testing API endpoints*
- **Database Admin**: [http://localhost:8080](http://localhost:8080)  
  *Adminer interface for database management*

### Direct Service Access
- **PostgreSQL Database**: `localhost:5433`
- **Redis Cache**: `localhost:6379`
- **Kafka Broker**: `localhost:9092`  
  *Used internally; for external tools, use Docker networking*

## Development Workflow

### Starting the Services

```bash
# Start all services in detached mode
docker compose -f docker/docker-compose.yml up -d

# View logs from all services
docker compose -f docker/docker-compose.yml logs -f

# View logs from a specific service
docker compose -f docker/docker-compose.yml logs -f marketdata-api
```

### Stopping the Services

```bash
# Stop all services
docker compose -f docker/docker-compose.yml down

# Stop and remove volumes (clean slate)
docker compose -f docker/docker-compose.yml down -v
```

### Rebuilding Services

```bash
# Rebuild and restart all services
docker compose -f docker/docker-compose.yml up --build

# Rebuild a specific service
docker compose -f docker/docker-compose.yml build marketdata-api
docker compose -f docker/docker-compose.yml up -d marketdata-api
```

## Troubleshooting

### Common Issues

**Port Conflicts**: If you encounter port binding errors, ensure the following ports are available:
- 8000 (API)
- 8080 (Adminer)
- 5433 (PostgreSQL)
- 6379 (Redis)

**Container Startup Issues**: Check container logs for detailed error messages:
```bash
docker compose -f docker/docker-compose.yml logs [container-name]
```

**Database Connection Issues**: Verify that the PostgreSQL container is healthy and accessible:
```bash
docker compose -f docker/docker-compose.yml ps
```

### Health Checks

Monitor the health of your services:

```bash
# Check API health
curl http://localhost:8000/health

# Check container status
docker compose -f docker/docker-compose.yml ps
```

## Next Steps

After successful setup:
1. Visit the API documentation to explore available endpoints
2. Use the Adminer interface to inspect the database schema
3. Set up polling jobs to start collecting market data
4. Monitor Kafka topics for real-time data flow

For detailed usage instructions, see the [Service Usage Guide](docs/service_usage.md).