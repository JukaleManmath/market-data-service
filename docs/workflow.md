# Market Data Service

## Overview

This service provides a comprehensive market data processing system that handles real-time price polling, data storage, and moving average calculations through a microservices architecture.

## Architecture Components

### Core Services

- **FastAPI App**: REST API server that handles client requests and provides endpoints for market data operations
- **Polling Worker**: Background service that periodically fetches market data from external sources and publishes events based on the symbols given through `/prices/poll` route
- **MA Consumer**: Kafka consumer service that processes price events and calculates 5-point moving average and stores to the `moving_average` table

### Infrastructure

- **Kafka**: Message broker that facilitates communication between the polling worker (producer) and moving average consumer
- **PostgreSQL**: Primary database for persistent storage of market data, polling configurations, and calculated averages
- **Redis**: High-performance caching layer for storing latest price data and optimizing response times


### 1. Polling Setup
The `/prices/poll` endpoint allows users to configure polling jobs, which are stored in the `polling_jobs` table. These jobs define what market data to fetch and how frequently based on the interval provided.

### 2. Data Fetching
The background polling service (`polling_worker_service.py`) executes configured polling jobs at specified intervals:
- Fetches latest market prices from external data sources using the shared logic in the `provider.py` service
- Stores raw data in the `raw_market_data` table
- Saves processed price points in the `price_points` table
- Publishes price events to the Kafka `price-events` topic

### 3. Moving Average Calculation
The MA Consumer service:
- Listens for messages on the `price-events` Kafka topic
- Computes 5-point moving averages for incoming price data
- Stores calculated averages in the `moving_average` table

### 4. Data Retrieval
The `/prices/latest` endpoint provides optimized access to current market data:
- First checks Redis cache for the latest price information
- If cache miss occurs, fetches fresh data from PostgreSQL `price_point` table within the specified interval
- Updates Redis cache with the latest data for subsequent requests
- If not found the fresh data within the specified interval (eg. 60 seconds) moves to calling external API
- Fetches data from the external API and stores in the tables `raw_market_data` and `price_point`and sends publishes price events to the Kafka `price-events` topic

## Database Schema

- `polling_jobs`: Configuration for automated data fetching jobs
- `raw_market_data`: Unprocessed (raw json) market data as received from external sources
- `price_points`: Cleaned and processed price data points
- `moving_average`: Calculated 5-point moving averages for price trends

