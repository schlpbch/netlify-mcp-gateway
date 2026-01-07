# MCP Gateway Implementation Plan

**Goal**: Design and implement a unified MCP Gateway service that provides a single entry point for Claude to access all federated MCP servers in the Swiss Travel Companion ecosystem.

**Status**: Planning Phase  
**Target Delivery**: Q2 2026 (Phase 1)  
**Technology Stack**: Java 21 + Spring Boot 3.4 + sbb-mcp-commons v1.8.0

---

## Executive Summary

The MCP Gateway will transform the current architecture where Claude connects to 4+ individual MCP servers into a streamlined model with a single connection point. This gateway will handle intelligent routing, unified tool discovery, cross-cutting concerns (auth, logging, caching), and provide the foundation for advanced federation patterns.

**Key Benefits**:

- **Simplified Client**: 1 connection instead of 4+
- **Unified Discovery**: Single catalog of all tools, resources, and prompts
- **Intelligent Routing**: Automatic failover and load balancing
- **Performance**: Response caching and request optimization
- **Scalability**: Foundation for future server additions (hotel-mcp, restaurant-mcp)
- **Consistency**: Leverages existing sbb-mcp-commons infrastructure

---

## Technology Stack Decision

> [!IMPORTANT]
> **Java/Spring Boot Selected**
>
> The gateway will be implemented using:
>
> - **Java 21** (LTS) - Consistent with journey-service-mcp and swiss-mobility-mcp
> - **Spring Boot 3.4** - Proven framework for MCP servers
> - **sbb-mcp-commons v1.8.0** - Shared infrastructure library
> - **Maven + Jib** - Build and containerization
>
> **Rationale**: Consistency with existing servers, shared infrastructure, team expertise, and ability to reuse sbb-mcp-commons patterns.

> [!WARNING]
> **Breaking Change: Client Configuration**
>
> Users will need to update their `claude_desktop_config.json` from 4 server entries to 1 gateway entry. Migration guide required.

---

## Proposed Changes

### Component 1: Gateway Core Service

#### [NEW] [mcp-gateway](file:///c:/Users/schlp/code/mcp-gateway)

**Purpose**: Main gateway service providing unified MCP protocol interface

**Technology Stack**:

- **Language**: Java 21
- **Framework**: Spring Boot 3.4.1
- **MCP Library**: sbb-mcp-commons v1.8.0
- **Build**: Maven 3.9+ with Jib plugin
- **Deployment**: Google Cloud Run (containerized)

**Project Structure**:

```
mcp-gateway/
├── src/main/java/ch/sbb/mcp/gateway/
│   ├── GatewayApplication.java
│   ├── config/
│   │   ├── McpGatewayConfig.java
│   │   ├── RedisConfig.java
│   │   └── RestClientConfig.java
│   ├── protocol/
│   │   ├── McpProtocolHandler.java
│   │   └── GatewayMcpController.java
│   ├── registry/
│   │   ├── ServerRegistry.java
│   │   ├── ServerRegistration.java
│   │   └── ServerHealthMonitor.java
│   ├── routing/
│   │   ├── IntelligentRouter.java
│   │   ├── RoutingStrategy.java
│   │   └── FailoverHandler.java
│   ├── cache/
│   │   ├── ResponseCache.java
│   │   └── CacheWarmer.java
│   └── client/
│       ├── BackendMcpClient.java
│       └── HttpBackendClient.java
├── src/main/resources/
│   ├── application.yml
│   ├── application-dev.yml
│   └── application-prod.yml
└── pom.xml
```

**Key Components**:

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
    console: "%d{yyyy-MM-dd HH:mm:ss} - %msg%n"
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

### Automated Tests

#### 1. Unit Tests

```java
@SpringBootTest
class ServerRegistryTest {
    @Autowired
    private ServerRegistry registry;
    
    @Test
    void shouldRegisterServer() {
        ServerRegistration server = ServerRegistration.builder()
            .id("test-server")
            .name("Test Server")
            .endpoint("http://localhost:8080/mcp")
            .build();
        
        registry.register(server);
        
        assertThat(registry.listServers()).hasSize(1);
        assertThat(registry.listServers().get(0).getId()).isEqualTo("test-server");
    }
    
    @Test
    void shouldResolveToolServer() {
        // Setup
        ServerRegistration server = createTestServer();
        registry.register(server);
        
        // Execute
        ServerRegistration resolved = registry.resolveToolServer("journey.findTrips");
        
        // Verify
        assertThat(resolved.getId()).isEqualTo("journey-service-mcp");
    }
}

@SpringBootTest
@AutoConfigureMockMvc
class McpProtocolHandlerIntegrationTest {
    @Autowired
    private MockMvc mockMvc;
    
    @MockBean
    private BackendMcpClient backendClient;
    
    @Test
    void shouldListToolsFromAllServers() throws Exception {
        mockMvc.perform(post("/mcp/tools/list"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tools").isArray())
            .andExpect(jsonPath("$.tools[?(@.name == 'journey.findTrips')]").exists())
            .andExpect(jsonPath("$.tools[?(@.name == 'mobility.getTripPricing')]").exists());
    }
    
    @Test
    void shouldRouteToolCallToCorrectServer() throws Exception {
        // Setup
        when(backendClient.callTool(any(), eq("findTrips"), any()))
            .thenReturn(createMockToolResult());
        
        // Execute
        mockMvc.perform(post("/mcp/tools/call")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"journey.findTrips\",\"arguments\":{\"from\":\"Zürich\",\"to\":\"Bern\"}}"))
            .andExpect(status().isOk());
        
        // Verify
        verify(backendClient).callTool(
            argThat(server -> server.getId().equals("journey-service-mcp")),
            eq("findTrips"),
            any()
        );
    }
}
```

#### 2. Integration Tests with Testcontainers

```java
@SpringBootTest
@Testcontainers
class GatewayIntegrationTest {
    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
        .withExposedPorts(6379);
    
    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.redis.host", redis::getHost);
        registry.add("spring.redis.port", redis::getFirstMappedPort);
    }
    
    @Test
    void shouldCacheToolResults() {
        // First call - cache miss
        McpToolResult result1 = callTool("journey.findTrips", args);
        
        // Second call - cache hit (should be faster)
        long start = System.currentTimeMillis();
        McpToolResult result2 = callTool("journey.findTrips", args);
        long duration = System.currentTimeMillis() - start;
        
        assertThat(result1).isEqualTo(result2);
        assertThat(duration).isLessThan(100); // Cache hit should be fast
    }
}
```

#### 3. Load Tests

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class GatewayLoadTest {
    @LocalServerPort
    private int port;
    
    @Test
    void shouldHandleConcurrentRequests() throws InterruptedException {
        int numThreads = 100;
        int requestsPerThread = 10;
        
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch latch = new CountDownLatch(numThreads * requestsPerThread);
        
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger errorCount = new AtomicInteger(0);
        
        for (int i = 0; i < numThreads * requestsPerThread; i++) {
            executor.submit(() -> {
                try {
                    callTool("journey.findTrips", createTestArgs());
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    errorCount.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }
        
        latch.await(60, TimeUnit.SECONDS);
        
        assertThat(successCount.get()).isGreaterThan(950); // >95% success rate
        assertThat(errorCount.get()).isLessThan(50);       // <5% error rate
    }
}
```

**Target Metrics**:

- P95 response time: <2s
- P99 response time: <3s
- Error rate: <0.1%
- Test coverage: >80%

---

## Migration Path

### Phase 1: Gateway Foundation (Q2 2026)

**Deliverables**:

- ✅ Gateway service with basic routing
- ✅ Server registry and discovery
- ✅ HTTP backend client using RestTemplate
- ✅ Unit and integration tests
- ✅ Deployment to Cloud Run staging

**Success Criteria**:

- Gateway successfully routes tool calls to all 4 backend servers
- Response times within 10% of direct connections
- 99.9% uptime in staging

### Phase 2: Production Deployment (Q2 2026)

**Deliverables**:

- ✅ Production deployment
- ✅ Migration guide for users
- ✅ Monitoring dashboards
- ✅ Canary rollout (10% → 100%)

**Success Criteria**:

- Zero downtime migration
- User adoption >80% within 2 weeks
- Performance parity with direct connections

### Phase 3: Advanced Features (Q3 2026)

**Deliverables**:

- ✅ Response caching with Redis
- ✅ Intelligent failover
- ✅ Load balancing across instances
- ✅ Event bus integration (cache warming)

**Success Criteria**:

- Cache hit rate >60%
- P95 response time improved by 30%
- Automatic failover tested and verified

### Phase 4: Ecosystem Expansion (Q4 2026)

**Deliverables**:

- ✅ Support for new servers (hotel-mcp, restaurant-mcp)
- ✅ Dynamic server registration
- ✅ Advanced routing strategies
- ✅ Multi-region support

**Success Criteria**:

- 6+ servers registered and operational
- Sub-second tool discovery
- Global availability >99.95%

---

## Success Metrics

### Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| P50 Response Time | <500ms | Spring Boot Actuator + Cloud Monitoring |
| P95 Response Time | <2s | Spring Boot Actuator + Cloud Monitoring |
| P99 Response Time | <3s | Spring Boot Actuator + Cloud Monitoring |
| Cache Hit Rate | >60% | Redis INFO + Micrometer |
| Error Rate | <0.1% | Cloud Logging |

### Adoption Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| User Migration | >80% in 2 weeks | Configuration telemetry |
| Gateway Uptime | >99.9% | Cloud Run metrics |
| Backend Server Health | >99.5% | Health check logs |

---

## Risk Mitigation

### Risk 1: Performance Degradation

**Risk**: Gateway adds latency compared to direct connections

**Mitigation**:

- Implement aggressive caching (60%+ hit rate target)
- Use HTTP/2 for backend connections (Spring Boot 3.4 native support)
- Deploy gateway in same region as backend servers
- Monitor P95/P99 latencies continuously with Micrometer

**Rollback**: Keep direct connection configuration as fallback

### Risk 2: Single Point of Failure

**Risk**: Gateway outage affects all MCP functionality

**Mitigation**:

- Deploy multiple gateway instances with Cloud Run auto-scaling
- Implement health checks via Spring Boot Actuator
- 99.9% SLA target with Cloud Run
- Fallback to direct connections if gateway unavailable

**Rollback**: Users can revert to direct server configuration

### Risk 3: sbb-mcp-commons Compatibility

**Risk**: Gateway depends on sbb-mcp-commons API stability

**Mitigation**:

- Pin sbb-mcp-commons version in pom.xml
- Comprehensive integration tests
- Staging environment for testing updates
- Follow semantic versioning for commons library

**Rollback**: Revert to previous sbb-mcp-commons version

---

## Next Steps

1. **Repository Setup**: Create `mcp-gateway` repository
2. **Prototype**: Build minimal viable gateway (routing only)
3. **Integration**: Test with journey-service-mcp and swiss-mobility-mcp
4. **Iteration**: Add caching, health checks, monitoring
5. **Deployment**: Staging → Canary → Production

---

**Document Version**: 2.0  
**Last Updated**: 2026-01-07  
**Author**: Andreas Schlapbach  
**Status**: Ready for Implementation
