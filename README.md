# MCP Gateway

Unified gateway for Swiss Travel Companion MCP servers, providing a single entry point for Claude to access all federated MCP servers in the ecosystem.

## Overview

The MCP Gateway transforms the current architecture where Claude connects to 4+ individual MCP servers into a streamlined model with a single connection point. The gateway handles:

- **Intelligent Routing**: Automatic routing to appropriate backend servers based on tool/resource/prompt names
- **Unified Discovery**: Single catalog of all tools, resources, and prompts across all servers
- **Response Caching**: Redis-backed caching with configurable TTL
- **Health Monitoring**: Automatic health checks and failover
- **Namespace Management**: Prefixing to avoid naming conflicts (e.g., `journey.findTrips`, `mobility.getTripPricing`)

## Architecture

```
Claude Desktop
      ↓
  MCP Gateway (this service)
      ↓
  ┌───┴───┬───────┬──────────┐
  ↓       ↓       ↓          ↓
Journey  Mobility Aareguru  Open-Meteo
Service   MCP      MCP       MCP
```

## Technology Stack

- **Java 21** (LTS)
- **Spring Boot 3.4.1**
- **sbb-mcp-commons v1.8.0** - Shared MCP infrastructure
- **Caffeine** - In-memory response caching
- **Maven + Jib** - Build and containerization

## Quick Start

### Prerequisites

- Java 21
- Maven 3.9+
- Redis (for caching)
- Running backend MCP servers

### Local Development

1. **Start Redis**:

   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. **Configure environment** (copy `.env.example` to `.env` and adjust):

   ```bash
   cp .env.example .env
   ```

3. **Run the gateway**:

   ```bash
   mvn spring-boot:run -Dspring-boot.run.profiles=dev
   ```

4. **Verify health**:

   ```bash
   curl http://localhost:8080/actuator/health
   ```

### Testing

```bash
# Run all tests
mvn clean test

# Run with coverage
mvn clean test jacoco:report

# View coverage report
open target/site/jacoco/index.html
```

## Configuration

### Backend Servers

Configure backend servers in `application.yml`:

```yaml
mcp:
  gateway:
    servers:
      - id: journey-service-mcp
        name: Journey Service
        endpoint: http://journey-service:8080/mcp
        transport: http
        priority: 1
```

### Caching

```yaml
mcp:
  gateway:
    cache:
      default-ttl: 5m
      max-size: 10000
      eviction-strategy: lru
```

### Health Monitoring

```yaml
mcp:
  gateway:
    health:
      check-interval: 60s
      unhealthy-threshold: 3
```

## API Endpoints

### MCP Protocol Endpoints

- `POST /mcp/tools/list` - List all tools
- `POST /mcp/tools/call` - Call a tool
- `POST /mcp/resources/list` - List all resources
- `POST /mcp/resources/read` - Read a resource
- `POST /mcp/prompts/list` - List all prompts
- `POST /mcp/prompts/get` - Get a prompt

### Management Endpoints

- `GET /actuator/health` - Health check
- `GET /actuator/metrics` - Metrics
- `GET /actuator/prometheus` - Prometheus metrics

## Namespace Prefixing

Tools and prompts are automatically prefixed with their server namespace to avoid conflicts:

- `journey-service-mcp` → `journey.*` (e.g., `journey.findTrips`)
- `swiss-mobility-mcp` → `mobility.*` (e.g., `mobility.getTripPricing`)
- `aareguru-mcp` → `aareguru.*` (e.g., `aareguru.getCurrentConditions`)
- `open-meteo-mcp` → `meteo.*` (e.g., `meteo.getCurrentWeather`)

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Migration Guide

See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for migrating from direct server connections to the gateway.

## License

Copyright © 2026 SBB CFF FFS
