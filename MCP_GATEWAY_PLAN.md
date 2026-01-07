# MCP Gateway Implementation Plan

## Status: ✅ ACTIVELY DEVELOPED

**Last Updated**: 2026-01-07  
**Current Implementation**: Netlify Edge Functions + TypeScript/Deno  
**Deployment**: Live at https://netliy-mcp-gateway.netlify.app

### Implementation Summary

- ✅ MCP Gateway deployed on Netlify Edge Functions (globally distributed)
- ✅ TypeScript + Deno runtime for fast, secure execution
- ✅ Interactive web UI for testing API endpoints
- ✅ Refactored routing with clean handler pattern
- ✅ Deployed and live in production

## Overview

The MCP Gateway serves as a unified entry point for AI assistants to access
multiple federated MCP servers. It provides intelligent routing, caching, health
monitoring, and capability aggregation across backend servers.

### Key Features Implemented

1. **Intelligent Routing**: Routes requests to appropriate backend servers based
   on tool/resource/prompt names
2. **Response Caching**: Caffeine-based in-memory caching with configurable TTL
3. **Health Monitoring**: Scheduled health checks with automatic failover
4. **Capability Aggregation**: Combines capabilities from all healthy servers
   with namespace prefixing
5. **Load Balancing**: Priority-based server selection with health awareness

## Technology Stack

### Current Implementation (Production)

- **Deno** - Secure, modern TypeScript runtime
- **Netlify Edge Functions** - Globally distributed, serverless compute
- **TypeScript** - Type-safe application logic
- **No external dependencies** - Native Web APIs only (Request, Response, fetch)

### Key Files

```
netlify/edge-functions/
├── mcp.ts                    # Edge function handler with route table pattern

public/
├── index.html               # Interactive UI for API testing
├── app.js                   # Client-side endpoint callers
├── styles.css              # Modern, dark-themed styling

src/
├── init.ts                 # Gateway initialization
├── config.ts               # Configuration management
├── client/BackendMcpClient.ts
├── protocol/McpProtocolHandler.ts
├── registry/ServerRegistry.ts
├── routing/IntelligentRouter.ts
├── cache/ResponseCache.ts
└── types/                  # TypeScript type definitions
```

### Architecture Decisions

#### Edge-First Design

- **Zero cold starts** — Netlify Edge Functions pre-warm globally
- **Sub-100ms latency** — Requests routed to nearest edge location
- **Automatic scaling** — Built-in auto-scaling, no servers to manage
- **Global CDN** — Automatic edge caching for assets

#### Routing Pattern

Instead of framework overhead, uses explicit route table:

```typescript
const routes = [
  { method: 'GET', path: /^\/mcp\/tools\/list$/, handler: ... },
  { method: 'POST', path: /^\/mcp\/tools\/call$/, handler: ... },
  // ... more routes
];
```

Benefits:

- Lightweight and tree-shakeable
- Full control over request/response
- Easy to migrate to other edge platforms (Cloudflare Workers, Deno Deploy)
- No framework lock-in

---

## Executive Summary

The MCP Gateway transforms the architecture where Claude connects to multiple
MCP servers into a streamlined, globally-distributed model using **Netlify Edge
Functions**.

**Key Benefits**:

- **Global Distribution** — Requests served from 100+ edge locations worldwide
- **Low Latency** — Sub-100ms response times due to geographic proximity
- **Auto-Scaling** — Handles traffic spikes without manual intervention
- **No Ops** — Fully managed infrastructure, zero server management
- **Interactive UI** — Built-in web interface for testing endpoints
- **Type-Safe** — Full TypeScript with Deno runtime security

---

## Technology Stack Decision

> [!IMPORTANT] > **Netlify Edge Functions + Deno Selected**
>
> The gateway is implemented using:
>
> - **Deno** — Secure, modern TypeScript runtime
> - **Netlify Edge Functions** — Globally distributed serverless compute
> - **TypeScript** — Type-safe application code
> - **Native Web APIs** — Request, Response, fetch (no external dependencies)
>
> **Rationale**: Edge-first deployment for global low-latency access, type
> safety, modern runtime, and complete infrastructure management by Netlify.

> [!NOTE] > **Future Migration Path**
>
> The implementation can easily migrate to:
>
> - **Cloudflare Workers** (with Hono framework)
> - **Deno Deploy** (native Deno support)
> - **AWS Lambda@Edge** (with minimal changes)
>
> Route handler pattern makes migration straightforward.

---

## Proposed Changes

### Component 1: Edge Function Handler

#### [IMPLEMENTED] [netlify/edge-functions/mcp.ts](netlify/edge-functions/mcp.ts)

**Purpose**: Main MCP protocol endpoint serving all requests from global edge
locations

**Implementation**:

```typescript
import type { Context } from '@netlify/edge-functions';
import { initializeGateway } from '../../src/init.ts';

// Route table pattern for lightweight, framework-free routing
const routes = [
  {
    method: 'GET',
    path: /^\/mcp\/tools\/list$/,
    handler: async (c) => {
      const gateway = c.gateway;
      const result = await gateway.protocolHandler.listTools();
      return c.json(result);
    },
  },
  {
    method: 'POST',
    path: /^\/mcp\/tools\/call$/,
    handler: async (c) => {
      const gateway = c.gateway;
      const body = await c.request.json();
      const result = await gateway.protocolHandler.callTool(body);
      return c.json(result);
    },
  },
  // ... more routes (resources, prompts, health)
];

export default async (request: Request, context: Context) => {
  try {
    const gateway = await initializeGateway(context);
    const url = new URL(request.url);

    for (const route of routes) {
      if (route.method === request.method && route.path.test(url.pathname)) {
        return await route.handler({ request, gateway, json, text });
      }
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/mcp/*' };
```

**Benefits**:

- No framework overhead — routes executed in microseconds
- Explicit routing — easy to understand and debug
- Global edge location — responses served from nearest data center
- Type-safe — full TypeScript support

##### 1. MCP Protocol Handler (`ch.sbb.mcp.gateway.protocol.McpProtocolHandler`)

Implements the MCP protocol using sbb-mcp-commons infrastructure:

```java
@Service
public class McpProtocolHandler {
    private final ServerRegistry serverRegistry;
    private final IntelligentRouter router;
    private final BackendMcpClient backendClient;

    /**
     * Aggregate tools from all registered servers
     */
    public List<McpTool> listTools() {
        return serverRegistry.getHealthyServers().stream()
            .flatMap(server -> server.getCapabilities().getTools().stream())
            .map(this::prefixToolName)
            .collect(Collectors.toList());
    }

    /**
     * Route tool call to appropriate backend server
     */
    public McpToolResult callTool(String toolName, Map<String, Object> arguments) {
        // 1. Resolve server from registry
        ServerRegistration server = router.resolveToolServer(toolName);

        // 2. Transform tool name (remove namespace prefix)
        String backendToolName = stripNamespace(toolName);

        // 3. Execute tool call on backend
        return backendClient.callTool(server, backendToolName, arguments);
    }

    /**
     * Aggregate resources from all registered servers
     */
    public List<McpResource> listResources() {
        return serverRegistry.getHealthyServers().stream()
            .flatMap(server -> server.getCapabilities().getResources().stream())
            .collect(Collectors.toList());
    }

    /**
     * Proxy resource read to backend server
     */
    public String readResource(String uri) {
        ServerRegistration server = router.resolveResourceServer(uri);
        return backendClient.readResource(server, uri);
    }

    /**
     * Aggregate prompts from all registered servers
     */
    public List<McpPrompt> listPrompts() {
        return serverRegistry.getHealthyServers().stream()
            .flatMap(server -> server.getCapabilities().getPrompts().stream())
            .map(this::prefixPromptName)
            .collect(Collectors.toList());
    }

    /**
     * Proxy prompt request to backend server
     */
    public McpPromptResult getPrompt(String promptName, Map<String, Object> arguments) {
        ServerRegistration server = router.resolvePromptServer(promptName);
        String backendPromptName = stripNamespace(promptName);
        return backendClient.getPrompt(server, backendPromptName, arguments);
    }

    private McpTool prefixToolName(McpTool tool) {
        // Add server namespace: "findTrips" -> "journey.findTrips"
        return tool.withName(tool.getServerId() + "." + tool.getName());
    }

    private String stripNamespace(String namespacedName) {
        // Remove server namespace: "journey.findTrips" -> "findTrips"
        return namespacedName.contains(".")
            ? namespacedName.substring(namespacedName.indexOf(".") + 1)
            : namespacedName;
    }
}
```

##### 2. Server Registry (`ch.sbb.mcp.gateway.registry.ServerRegistry`)

Manages backend MCP server connections and metadata:

```java
@Component
public class ServerRegistry {
    private final Map<String, ServerRegistration> servers = new ConcurrentHashMap<>();
    private final ServerHealthMonitor healthMonitor;

    /**
     * Register a new backend server
     */
    public void register(ServerRegistration registration) {
        servers.put(registration.getId(), registration);
        healthMonitor.startMonitoring(registration);
        log.info("Registered server: {} at {}",
            registration.getName(), registration.getEndpoint());
    }

    /**
     * Unregister a backend server
     */
    public void unregister(String serverId) {
        ServerRegistration server = servers.remove(serverId);
        if (server != null) {
            healthMonitor.stopMonitoring(serverId);
            log.info("Unregistered server: {}", server.getName());
        }
    }

    /**
     * Get all registered servers
     */
    public List<ServerRegistration> listServers() {
        return new ArrayList<>(servers.values());
    }

    /**
     * Get only healthy servers
     */
    public List<ServerRegistration> getHealthyServers() {
        return servers.values().stream()
            .filter(server -> server.getHealth().getStatus() == HealthStatus.HEALTHY)
            .collect(Collectors.toList());
    }

    /**
     * Resolve server by tool name
     */
    public ServerRegistration resolveToolServer(String toolName) {
        String serverId = extractServerId(toolName);
        return servers.values().stream()
            .filter(server -> server.getId().equals(serverId))
            .filter(server -> server.getCapabilities().getTools().contains(stripNamespace(toolName)))
            .findFirst()
            .orElseThrow(() -> new ServerNotFoundException("No server found for tool: " + toolName));
    }

    /**
     * Resolve server by resource URI
     */
    public ServerRegistration resolveResourceServer(String uri) {
        return servers.values().stream()
            .filter(server -> server.getCapabilities().getResources().stream()
                .anyMatch(resource -> uri.startsWith(resource.getUriPrefix())))
            .findFirst()
            .orElseThrow(() -> new ServerNotFoundException("No server found for resource: " + uri));
    }

    /**
     * Resolve server by prompt name
     */
    public ServerRegistration resolvePromptServer(String promptName) {
        String serverId = extractServerId(promptName);
        return servers.values().stream()
            .filter(server -> server.getId().equals(serverId))
            .filter(server -> server.getCapabilities().getPrompts().contains(stripNamespace(promptName)))
            .findFirst()
            .orElseThrow(() -> new ServerNotFoundException("No server found for prompt: " + promptName));
    }
}

/**
 * Server registration model
 */
@Data
@Builder
public class ServerRegistration {
    private String id;                    // "journey-service-mcp"
    private String name;                  // "Journey Service"
    private String endpoint;              // "http://journey-service:8080/mcp"
    private TransportType transport;      // HTTP or STDIO
    private ServerCapabilities capabilities;
    private ServerHealth health;
    private int priority;                 // For load balancing

    public enum TransportType {
        HTTP, STDIO
    }
}

/**
 * Server capabilities
 */
@Data
@Builder
public class ServerCapabilities {
    private List<String> tools;           // ["findTrips", "compareRoutes"]
    private List<ResourceCapability> resources;
    private List<String> prompts;         // ["plan-trip", "compare-routes"]
}

/**
 * Server health status
 */
@Data
@Builder
public class ServerHealth {
    private HealthStatus status;          // HEALTHY, DEGRADED, DOWN
    private Instant lastCheck;
    private Duration latency;
    private String errorMessage;

    public enum HealthStatus {
        HEALTHY, DEGRADED, DOWN
    }
}
```

##### 3. Intelligent Router (`ch.sbb.mcp.gateway.routing.IntelligentRouter`)

Routes requests to appropriate backend servers:

```java
@Service
public class IntelligentRouter {
    private final ServerRegistry registry;
    private final ResponseCache cache;
    private final FailoverHandler failoverHandler;

    /**
     * Route tool call with caching and failover
     */
    public McpToolResult routeToolCall(String toolName, Map<String, Object> arguments) {
        // 1. Check cache first
        String cacheKey = cache.generateKey("tool", toolName, arguments);
        McpToolResult cached = cache.get(cacheKey);
        if (cached != null) {
            log.debug("Cache hit for tool: {}", toolName);
            return cached;
        }

        // 2. Resolve server from registry
        ServerRegistration server = registry.resolveToolServer(toolName);

        // 3. Check health
        if (server.getHealth().getStatus() == HealthStatus.DOWN) {
            return failoverHandler.handleToolCallFailover(server, toolName, arguments);
        }

        // 4. Execute and cache result
        McpToolResult result = executeToolCall(server, toolName, arguments);
        cache.set(cacheKey, result, getCacheTtl(toolName));

        return result;
    }

    /**
     * Select instance for load balancing (future multi-instance support)
     */
    public ServerRegistration selectInstance(List<ServerRegistration> candidates) {
        // Simple priority-based selection for now
        return candidates.stream()
            .min(Comparator.comparingInt(ServerRegistration::getPriority))
            .orElseThrow(() -> new NoHealthyServerException("No healthy instances available"));
    }

    private Duration getCacheTtl(String toolName) {
        // Different TTLs for different tool types
        if (toolName.contains("findTrips")) return Duration.ofMinutes(15);
        if (toolName.contains("getTripPricing")) return Duration.ofMinutes(10);
        if (toolName.contains("getCurrentWeather")) return Duration.ofHours(1);
        return Duration.ofMinutes(5);
    }
}
```

##### 4. Response Cache (`ch.sbb.mcp.gateway.cache.ResponseCache`)

Caches frequently accessed data using Redis:

```java
@Service
public class ResponseCache {
    private final RedisTemplate<String, McpToolResult> redisTemplate;
    private final CacheConfig config;

    /**
     * Get cached result
     */
    public <T> T get(String key) {
        return (T) redisTemplate.opsForValue().get(key);
    }

    /**
     * Cache result with TTL
     */
    public <T> void set(String key, T value, Duration ttl) {
        redisTemplate.opsForValue().set(key, value, ttl);
    }

    /**
     * Invalidate cache by pattern
     */
    public void invalidate(String pattern) {
        Set<String> keys = redisTemplate.keys(pattern);
        if (keys != null && !keys.isEmpty()) {
            redisTemplate.delete(keys);
        }
    }

    /**
     * Generate cache key
     */
    public String generateKey(String operation, String name, Map<String, Object> params) {
        String paramsHash = DigestUtils.md5DigestAsHex(
            new ObjectMapper().writeValueAsString(params).getBytes()
        );
        return String.format("mcp:gateway:%s:%s:%s", operation, name, paramsHash);
    }

    /**
     * Warm cache with predicted requests (for event bus integration)
     */
    public void warmCache(String toolName, List<Map<String, Object>> argsArray) {
        argsArray.forEach(args -> {
            String key = generateKey("tool", toolName, args);
            // Pre-fetch and cache
            // Implementation depends on event bus integration
        });
    }
}

@ConfigurationProperties(prefix = "mcp.gateway.cache")
@Data
public class CacheConfig {
    private Duration defaultTtl = Duration.ofMinutes(5);
    private int maxSize = 10000;
    private String evictionStrategy = "lru";  // LRU or LFU
}
```

##### 5. Backend Client (`ch.sbb.mcp.gateway.client.BackendMcpClient`)

Communicates with backend MCP servers:

```java
@Service
public class BackendMcpClient {
    private final RestTemplate restTemplate;
    private final RetryTemplate retryTemplate;

    /**
     * Call tool on backend server
     */
    public McpToolResult callTool(ServerRegistration server, String toolName, Map<String, Object> arguments) {
        return retryTemplate.execute(context -> {
            String url = server.getEndpoint() + "/tools/call";

            McpToolRequest request = McpToolRequest.builder()
                .name(toolName)
                .arguments(arguments)
                .build();

            ResponseEntity<McpToolResult> response = restTemplate.postForEntity(
                url,
                request,
                McpToolResult.class
            );

            return response.getBody();
        });
    }

    /**
     * Read resource from backend server
     */
    public String readResource(ServerRegistration server, String uri) {
        return retryTemplate.execute(context -> {
            String url = server.getEndpoint() + "/resources/read";

            McpResourceRequest request = McpResourceRequest.builder()
                .uri(uri)
                .build();

            ResponseEntity<String> response = restTemplate.postForEntity(
                url,
                request,
                String.class
            );

            return response.getBody();
        });
    }

    /**
     * Get prompt from backend server
     */
    public McpPromptResult getPrompt(ServerRegistration server, String promptName, Map<String, Object> arguments) {
        return retryTemplate.execute(context -> {
            String url = server.getEndpoint() + "/prompts/get";

            McpPromptRequest request = McpPromptRequest.builder()
                .name(promptName)
                .arguments(arguments)
                .build();

            ResponseEntity<McpPromptResult> response = restTemplate.postForEntity(
                url,
                request,
                McpPromptResult.class
            );

            return response.getBody();
        });
    }

    /**
     * Check health of backend server
     */
    public ServerHealth checkHealth(ServerRegistration server) {
        try {
            Instant start = Instant.now();
            String url = server.getEndpoint() + "/actuator/health";

            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            Duration latency = Duration.between(start, Instant.now());

            return ServerHealth.builder()
                .status(response.getStatusCode().is2xxSuccessful()
                    ? HealthStatus.HEALTHY
                    : HealthStatus.DEGRADED)
                .lastCheck(Instant.now())
                .latency(latency)
                .build();

        } catch (Exception e) {
            return ServerHealth.builder()
                .status(HealthStatus.DOWN)
                .lastCheck(Instant.now())
                .errorMessage(e.getMessage())
                .build();
        }
    }
}
```

---

### Component 2: Configuration

#### [NEW] [pom.xml](file:///c:/Users/schlp/code/mcp-gateway/pom.xml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.1</version>
    </parent>

    <groupId>ch.sbb.mcp</groupId>
    <artifactId>mcp-gateway</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <name>MCP Gateway</name>
    <description>Unified gateway for Swiss Travel Companion MCP servers</description>

    <properties>
        <java.version>21</java.version>
        <sbb-mcp-commons.version>1.8.0</sbb-mcp-commons.version>
    </properties>

    <dependencies>
        <!-- Spring Boot -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>

        <!-- SBB MCP Commons -->
        <dependency>
            <groupId>ch.sbb.mcp</groupId>
            <artifactId>sbb-mcp-commons</artifactId>
            <version>${sbb-mcp-commons.version}</version>
        </dependency>

        <!-- Utilities -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Testing -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>testcontainers</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>junit-jupiter</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>

            <!-- Jib for containerization -->
            <plugin>
                <groupId>com.google.cloud.tools</groupId>
                <artifactId>jib-maven-plugin</artifactId>
                <version>3.4.0</version>
                <configuration>
                    <from>
                        <image>eclipse-temurin:21-jre-alpine</image>
                    </from>
                    <to>
                        <image>gcr.io/journey-service-mcp/mcp-gateway</image>
                        <tags>
                            <tag>latest</tag>
                            <tag>${project.version}</tag>
                        </tags>
                    </to>
                    <container>
                        <jvmFlags>
                            <jvmFlag>-Xms512m</jvmFlag>
                            <jvmFlag>-Xmx1024m</jvmFlag>
                        </jvmFlags>
                        <ports>
                            <port>8080</port>
                        </ports>
                    </container>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

#### [NEW] [application.yml](file:///c:/Users/schlp/code/mcp-gateway/src/main/resources/application.yml)

```yaml
spring:
  application:
    name: mcp-gateway

  redis:
    host: ${REDIS_HOST:localhost}
    port: ${REDIS_PORT:6379}
    password: ${REDIS_PASSWORD:}
    timeout: 2000ms
    lettuce:
      pool:
        max-active: 10
        max-idle: 5
        min-idle: 2

server:
  port: 8080
  compression:
    enabled: true

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  metrics:
    export:
      prometheus:
        enabled: true

mcp:
  gateway:
    cache:
      default-ttl: 5m
      max-size: 10000
      eviction-strategy: lru

    routing:
      retry:
        max-attempts: 3
        backoff-delay: 1s
        backoff-multiplier: 2

      timeout:
        connect: 5s
        read: 30s

    health:
      check-interval: 60s
      unhealthy-threshold: 3

    # Pre-configured backend servers (can also register dynamically)
    servers:
      - id: journey-service-mcp
        name: Journey Service
        endpoint: ${JOURNEY_SERVICE_URL:http://journey-service:8080/mcp}
        transport: http
        priority: 1

      - id: swiss-mobility-mcp
        name: Swiss Mobility
        endpoint: ${SWISS_MOBILITY_URL:http://swiss-mobility:8080/mcp}
        transport: http
        priority: 1

      - id: aareguru-mcp
        name: Aareguru
        endpoint: ${AAREGURU_URL:http://aareguru:8000/mcp}
        transport: http
        priority: 2

      - id: open-meteo-mcp
        name: Open-Meteo
        endpoint: ${OPEN_METEO_URL:http://open-meteo:8000/mcp}
        transport: http
        priority: 2

logging:
  level:
    ch.sbb.mcp.gateway: INFO
    org.springframework.web: INFO
  pattern:
    console: '%d{yyyy-MM-dd HH:mm:ss} - %msg%n'
```

---

### Component 3: Deployment

#### [NEW] [cloudbuild.yaml](file:///c:/Users/schlp/code/mcp-gateway/cloudbuild.yaml)

```yaml
steps:
  # Build with Maven
  - name: 'maven:3.9-eclipse-temurin-21'
    entrypoint: mvn
    args: ['clean', 'package', '-DskipTests']

  # Run tests
  - name: 'maven:3.9-eclipse-temurin-21'
    entrypoint: mvn
    args: ['test']

  # Build and push container with Jib
  - name: 'maven:3.9-eclipse-temurin-21'
    entrypoint: mvn
    args:
      - 'compile'
      - 'jib:build'
      - '-Djib.to.image=gcr.io/$PROJECT_ID/mcp-gateway:$COMMIT_SHA'
      - '-Djib.to.tags=latest'

  # Deploy to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'mcp-gateway-staging'
      - '--image=gcr.io/$PROJECT_ID/mcp-gateway:$COMMIT_SHA'
      - '--region=europe-west6'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--set-env-vars=SPRING_PROFILES_ACTIVE=staging'
      - '--vpc-connector=mcp-vpc-connector'
      - '--memory=1Gi'
      - '--cpu=2'
      - '--min-instances=1'
      - '--max-instances=10'

images:
  - 'gcr.io/$PROJECT_ID/mcp-gateway:$COMMIT_SHA'
  - 'gcr.io/$PROJECT_ID/mcp-gateway:latest'

timeout: 1200s
```

---

## Verification Plan

### Current Deployment Status

**Live at**: https://netliy-mcp-gateway.netlify.app

**Endpoints Tested**:

- ✅ GET /mcp/tools/list
- ✅ POST /mcp/tools/call
- ✅ GET /mcp/resources/list
- ✅ POST /mcp/resources/read
- ✅ GET /mcp/prompts/list
- ✅ POST /mcp/prompts/get
- ✅ GET /health

**Interactive Testing**: Use the web UI at https://netliy-mcp-gateway.netlify.app to test endpoints in real-time

## Migration Path

### Phase 1: ✅ Foundation (Completed Jan 2026)

**Deliverables**:

- ✅ Netlify Edge Functions setup
- ✅ Route table with all MCP endpoints
- ✅ Interactive web UI
- ✅ Protocol handlers (tools, resources, prompts, health)
- ✅ Live deployment to production

**Result**: Gateway live and operational at https://netliy-mcp-gateway.netlify.app

### Phase 2: Optimization (Current)

**In Progress**:

- Refactored routing pattern for maintainability
- Added handler pattern for clean code organization
- Prepared for future framework migration (Hono, Cloudflare Workers)

**Next**:

- Performance monitoring and optimization
- Caching layer implementation
- Backend server health monitoring

### Phase 3: Advanced Features (Q1 2026)

**Planned**:

- Response caching with edge location support
- Intelligent failover and load balancing
- Backend server health checks and monitoring
- Metrics and observability dashboard

### Phase 4: Ecosystem Expansion (Q2 2026)

**Planned**:

- Support for new backend servers
- Dynamic server registration API
- Advanced routing strategies
- Multi-region optimization

---

## Success Metrics

### Performance Metrics

| Metric            | Target | Measurement                             |
| ----------------- | ------ | --------------------------------------- |
| P50 Response Time | <500ms | Spring Boot Actuator + Cloud Monitoring |
| P95 Response Time | <2s    | Spring Boot Actuator + Cloud Monitoring |
| P99 Response Time | <3s    | Spring Boot Actuator + Cloud Monitoring |
| Cache Hit Rate    | >60%   | Redis INFO + Micrometer                 |
| Error Rate        | <0.1%  | Cloud Logging                           |

### Adoption Metrics

| Metric                | Target          | Measurement             |
| --------------------- | --------------- | ----------------------- |
| User Migration        | >80% in 2 weeks | Configuration telemetry |
| Gateway Uptime        | >99.9%          | Cloud Run metrics       |
| Backend Server Health | >99.5%          | Health check logs       |

---

## Risk Mitigation

### Risk 1: Edge Function Latency

**Risk**: Global edge deployment adds latency

**Mitigation**:

- ✅ Netlify Edge Functions serve from nearest location automatically
- Implement aggressive caching at edge
- Monitor performance continuously

### Risk 2: Backend Server Reliability

**Risk**: Single backend failure affects gateway

**Mitigation**:

- Health checks for all backend servers
- Automatic failover when server is down
- Fallback responses for critical endpoints

### Risk 3: Framework Migration

**Risk**: Need to migrate to different framework in future

**Mitigation**:

- ✅ Route table pattern is framework-agnostic
- Can easily migrate to Hono, Cloudflare Workers, Deno Deploy
- No vendor lock-in with current design

---

## Next Steps

1. **Performance Monitoring** — Set up metrics and dashboards
2. **Caching Implementation** — Add edge caching for responses
3. **Health Monitoring** — Implement backend server health checks
4. **Load Testing** — Verify performance under load
5. **Documentation** — Update README with usage examples

---

**Document Version**: 3.0 (Updated to reflect Netlify Edge Functions)  
**Last Updated**: 2026-01-07  
**Author**: Andreas Schlapbach  
**Status**: In Production
