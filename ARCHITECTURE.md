# MCP Gateway Architecture

This document describes the architecture, design decisions, and implementation details of the MCP Gateway.

## Overview

The MCP Gateway is a unified entry point for AI assistants to access federated MCP servers. It provides intelligent routing, response caching, health monitoring, and namespace management.

## Architecture Diagram

```
┌─────────────────┐
│  Claude Desktop │
└────────┬────────┘
         │ MCP Protocol
         ↓
┌─────────────────────────────────────────┐
│         MCP Gateway (Cloud Run)         │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   GatewayMcpController           │  │
│  │   (REST Endpoints)               │  │
│  └──────────┬───────────────────────┘  │
│             ↓                           │
│  ┌──────────────────────────────────┐  │
│  │   McpProtocolHandler             │  │
│  │   (Aggregation & Namespace)      │  │
│  └──────────┬───────────────────────┘  │
│             ↓                           │
│  ┌──────────────────────────────────┐  │
│  │   IntelligentRouter              │  │
│  │   (Cache-aware routing)          │  │
│  └──────┬───────────────────────────┘  │
│         │                               │
│    ┌────┴────┐                          │
│    ↓         ↓                          │
│  ┌────┐   ┌──────────┐                 │
│  │Cache│   │Registry  │                 │
│  └────┘   └──────────┘                 │
│              ↓                           │
│  ┌──────────────────────────────────┐  │
│  │   BackendMcpClient               │  │
│  │   (HTTP + Retry)                 │  │
│  └──────────┬───────────────────────┘  │
└─────────────┼───────────────────────────┘
              │
     ┌────────┼────────┬────────┐
     ↓        ↓        ↓        ↓
┌─────────┐ ┌────┐ ┌────┐ ┌────┐
│Journey  │ │Mob │ │Aare│ │Meteo│
│Service  │ │ility│ │guru│ │     │
└─────────┘ └────┘ └────┘ └────┘
```

## Core Components

### 1. GatewayMcpController

**Purpose**: HTTP endpoint layer for MCP protocol

**Responsibilities**:

- Expose REST endpoints (`/mcp/tools/*`, `/mcp/resources/*`, `/mcp/prompts/*`)
- Request validation
- Error handling and response formatting
- Logging and monitoring

**Key Methods**:

```java
@PostMapping("/mcp/tools/list")
Map<String, Object> listTools()

@PostMapping("/mcp/tools/call")
Map<String, Object> callTool(@RequestBody Map<String, Object> request)

@PostMapping("/mcp/resources/list")
Map<String, Object> listResources()

@PostMapping("/mcp/resources/read")
Map<String, Object> readResource(@RequestBody Map<String, Object> request)
```

### 2. McpProtocolHandler

**Purpose**: MCP protocol logic and capability aggregation

**Responsibilities**:

- Aggregate capabilities from all registered servers
- Add namespace prefixes to tools/prompts
- Route requests to appropriate backend
- Strip namespaces before backend calls

**Namespace Mapping**:

```java
private String extractServerId(String namespacedName) {
    String prefix = namespacedName.substring(0, namespacedName.indexOf("."));
    return switch (prefix) {
        case "journey" -> "journey-service-mcp";
        case "mobility" -> "swiss-mobility-mcp";
        case "aareguru" -> "aareguru-mcp";
        case "meteo", "weather" -> "open-meteo-mcp";
        default -> prefix + "-mcp";
    };
}
```

### 3. IntelligentRouter

**Purpose**: Cache-aware routing with health checking

**Responsibilities**:

- Check cache before routing
- Verify server health
- Route to backend
- Cache successful responses
- Dynamic TTL assignment

**Routing Flow**:

```java
public Map<String, Object> routeToolCall(String toolName, Map<String, Object> arguments) {
    // 1. Check cache
    String cacheKey = generateCacheKey(toolName, arguments);
    Map<String, Object> cached = cache.get(cacheKey);
    if (cached != null) return cached;
    
    // 2. Resolve server
    ServerRegistration server = registry.resolveToolServer(toolName);
    
    // 3. Check health
    if (server.health().status() != HEALTHY) {
        throw new ServerUnhealthyException();
    }
    
    // 4. Call backend
    Map<String, Object> result = client.callTool(server, stripNamespace(toolName), arguments);
    
    // 5. Cache result
    cache.put(cacheKey, result, determineTTL(toolName));
    
    return result;
}
```

### 4. ServerRegistry

**Purpose**: Thread-safe server registration and lookup

**Responsibilities**:

- Register/unregister servers
- List all servers
- Filter healthy servers
- Resolve servers by tool/resource/prompt name
- Update server health status

**Data Structure**:

```java
private final Map<String, ServerRegistration> servers = new ConcurrentHashMap<>();
```

**Resolution Logic**:

```java
public ServerRegistration resolveToolServer(String toolName) {
    String serverId = extractServerId(toolName);
    ServerRegistration server = servers.get(serverId);
    
    // Verify server provides this tool
    String bareToolName = stripNamespace(toolName);
    if (!server.capabilities().tools().contains(bareToolName)) {
        throw new ServerNotFoundException();
    }
    
    return server;
}
```

### 5. ResponseCache

**Purpose**: In-memory caching with Caffeine

**Responsibilities**:

- Store/retrieve cached responses
- TTL management
- Cache key generation (MD5)
- Pattern-based invalidation

**Configuration**:

```java
@Bean
public Cache<String, Map<String, Object>> responseCache(GatewayProperties properties) {
    return Caffeine.newBuilder()
        .maximumSize(properties.getCache().getMaxSize())
        .expireAfterWrite(Duration.parse(properties.getCache().getDefaultTtl()))
        .build();
}
```

### 6. BackendMcpClient

**Purpose**: HTTP client for backend communication

**Responsibilities**:

- Execute tool calls with retry
- Read resources with retry
- Get prompts with retry
- Health check endpoints
- List capabilities

**Retry Configuration**:

```java
@Bean
public RetryTemplate retryTemplate(GatewayProperties properties) {
    return RetryTemplate.builder()
        .maxAttempts(properties.getRouting().getRetry().getMaxAttempts())
        .exponentialBackoff(
            properties.getRouting().getRetry().getBackoffDelay(),
            properties.getRouting().getRetry().getBackoffMultiplier(),
            properties.getRouting().getRetry().getMaxDelay()
        )
        .build();
}
```

### 7. ServerHealthMonitor

**Purpose**: Scheduled health checking

**Responsibilities**:

- Periodic health checks
- Update server health status
- Track consecutive failures
- Unhealthy threshold detection

**Scheduling**:

```java
@Scheduled(fixedDelayString = "${mcp.gateway.health.check-interval}")
public void checkHealth() {
    registry.listServers().forEach(server -> {
        ServerHealth health = client.checkHealth(server);
        registry.updateHealth(server.id(), health);
    });
}
```

## Domain Models

### ServerRegistration (Java Record)

```java
public record ServerRegistration(
    String id,
    String name,
    String endpoint,
    TransportType transport,
    ServerCapabilities capabilities,
    ServerHealth health,
    int priority,
    Instant registeredAt
) {
    public static Builder builder() { ... }
}
```

### ServerHealth (Java Record)

```java
public record ServerHealth(
    HealthStatus status,
    Instant lastCheck,
    Duration latency,
    String errorMessage,
    int consecutiveFailures
) {
    public enum HealthStatus {
        HEALTHY, DEGRADED, DOWN, UNKNOWN
    }
}
```

### ServerCapabilities (Java Record)

```java
public record ServerCapabilities(
    List<String> tools,
    List<ResourceCapability> resources,
    List<String> prompts
) {
    public record ResourceCapability(
        String uriPrefix,
        String description
    ) {}
}
```

## Design Decisions

### 1. Lombok-Free Architecture

**Decision**: Remove Lombok, use Java 21 records

**Rationale**:

- Java 21 records provide immutability out-of-the-box
- No annotation processing overhead
- Better IDE support
- Cleaner stack traces
- Explicit control over behavior

**Implementation**:

- Domain models: Java records with builders
- Configuration: Standard POJOs with getters/setters
- Logging: Standard SLF4J `LoggerFactory.getLogger()`

### 2. In-Memory Caching (Caffeine)

**Decision**: Use Caffeine instead of Redis

**Rationale**:

- Simpler deployment (no external dependencies)
- Lower latency (in-process)
- Sufficient for MVP
- Easy to migrate to Redis later

**Trade-offs**:

- Cache not shared across instances
- Cache lost on restart
- Limited by instance memory

### 3. Namespace Prefixing

**Decision**: Add server ID prefix to tool/prompt names

**Rationale**:

- Avoid naming conflicts
- Clear server attribution
- Support future multi-instance backends

**Format**: `{server-prefix}.{tool-name}`

**Examples**:

- `journey.findTrips`
- `mobility.getTripPricing`
- `aareguru.getCurrentConditions`

### 4. Health-Based Routing

**Decision**: Only route to healthy servers

**Rationale**:

- Prevent cascading failures
- Improve user experience
- Enable graceful degradation

**Implementation**:

- Scheduled health checks (60s interval)
- Unhealthy threshold (3 consecutive failures)
- Automatic recovery when health improves

### 5. Retry with Exponential Backoff

**Decision**: Retry failed backend calls with backoff

**Rationale**:

- Handle transient failures
- Reduce load on struggling backends
- Improve success rate

**Configuration**:

```yaml
mcp:
  gateway:
    routing:
      retry:
        max-attempts: 3
        backoff-delay: 100ms
        backoff-multiplier: 2.0
        max-delay: 2s
```

## Configuration

### Application Properties

```yaml
mcp:
  gateway:
    cache:
      default-ttl: 5m
      max-size: 10000
    
    routing:
      retry:
        max-attempts: 3
        backoff-delay: 100ms
        backoff-multiplier: 2.0
      
      timeout:
        connect: 5s
        read: 30s
    
    health:
      check-interval: 60s
      unhealthy-threshold: 3
    
    servers:
      - id: journey-service-mcp
        name: Journey Service
        endpoint: ${JOURNEY_SERVICE_URL}
        transport: http
        priority: 1
```

### Environment Variables

- `JOURNEY_SERVICE_URL`: Journey Service endpoint
- `SWISS_MOBILITY_URL`: Swiss Mobility endpoint
- `AAREGURU_URL`: Aareguru endpoint
- `OPEN_METEO_URL`: Open Meteo endpoint
- `SPRING_PROFILES_ACTIVE`: Active profile (dev/prod)

## Performance Characteristics

### Latency

- **Cache Hit**: ~5ms
- **Cache Miss**: Backend latency + ~10ms overhead
- **Health Check**: ~50ms per server

### Throughput

- **Max RPS**: ~1000 (single instance, cached)
- **Max RPS**: ~100 (single instance, uncached)
- **Scaling**: Linear with instances

### Memory

- **Base**: ~200MB
- **Cache**: ~10MB per 1000 entries
- **Max**: ~1GB (configured limit)

## Security Considerations

### Current State

- Public access (no authentication)
- No rate limiting
- No input validation beyond Spring defaults

### Recommendations

1. **Authentication**: Add API key or OAuth
2. **Rate Limiting**: Implement per-client limits
3. **Input Validation**: Add schema validation
4. **Network Security**: Use VPC for backend access
5. **Secrets Management**: Use Secret Manager for credentials

## Monitoring

### Key Metrics

- Request count and latency (P50, P95, P99)
- Cache hit rate
- Backend health status
- Error rate by type
- Memory and CPU usage

### Logging

- Request/response logging (DEBUG level)
- Health check results
- Cache operations
- Backend errors

### Alerts

- Error rate > 5%
- P95 latency > 1s
- All backends unhealthy
- Memory usage > 80%

## Future Enhancements

### Short Term

1. Add authentication/authorization
2. Implement rate limiting
3. Add request validation
4. Set up monitoring dashboards

### Medium Term

1. Support WebSocket transport
2. Add circuit breaker pattern
3. Implement request batching
4. Add distributed tracing

### Long Term

1. Multi-region deployment
2. Advanced load balancing
3. A/B testing support
4. Analytics and insights

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Spring Boot Documentation](https://spring.io/projects/spring-boot)
- [Caffeine Cache](https://github.com/ben-manes/caffeine)
- [Google Cloud Run](https://cloud.google.com/run)
