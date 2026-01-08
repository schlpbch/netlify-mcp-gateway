# MCP Gateway Architecture

This document describes the architecture, design decisions, and implementation
details of the MCP Gateway.

## Overview

The MCP Gateway is a globally-distributed edge function that serves as a unified
entry point for MCP protocol requests. Deployed on **deno Edge Functions**, it
provides:

- **Global Low-Latency Access**: Requests served from 100+ edge locations
  worldwide
- **Type-Safe TypeScript**: Full Deno runtime with TypeScript support
- **Lightweight Routing**: Framework-free handler pattern for minimal overhead
- **Zero Ops**: Fully managed infrastructure with automatic scaling

## Architecture Diagram

```
┌──────────────────────┐
│  Claude Desktop      │
└──────────┬───────────┘
           │ MCP Protocol (HTTP)
           ↓
  Global CDN (100+ edge locations)
           │
       ┌───┴───┐
       ↓       ↓
  Closest Edge Location
       │
       ↓
┌──────────────────────────────────────────────────────┐
│  deno Edge Function (Deno)                        │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Route Table Pattern                            │ │
│  │ { method, path, handler }                      │ │
│  └──────────────┬─────────────────────────────────┘ │
│                 ↓                                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ Route Handler                                  │ │
│  │ (Aggregation)                                  │ │
│  └──────────────┬─────────────────────────────────┘ │
│                 ↓                                    │
│  ┌────────────────────────────────────────────────┐ │
│  │ BackendMcpClient                               │ │
│  │ (fetch + retry)                                │ │
│  └──────────────┬─────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │
       ┌───────────────┼───────────────┬───────────────┐
       ↓               ↓               ↓               ↓
   (Backend MCP Servers)
```

## Core Components

### 1. Route Handler Pattern

**Purpose**: Framework-free request routing with minimal overhead

**Design**:

```typescript
interface Route {
  method: string;
  path: RegExp;
  handler: (context: RouteContext) => Promise<Response>;
}

const routes: Route[] = [
  {
    method: 'GET',
    path: /^\/mcp\/tools\/list$/,
    handler: async (c) => {
      const result = await c.gateway.protocolHandler.listTools();
      return c.json(result);
    },
  },
  {
    method: 'POST',
    path: /^\/mcp\/tools\/call$/,
    handler: async (c) => {
      const body = await c.request.json();
      const result = await c.gateway.protocolHandler.callTool(body);
      return c.json(result);
    },
  },
  // ... more routes
];
```

**Benefits**:

- Zero framework overhead
- Explicit routing with regex patterns
- Tree-shakeable for bundle optimization
- Full control over request/response
- Easy migration path to other platforms (Hono, Cloudflare, Deno Deploy)

### 2. McpProtocolHandler (src/protocol/McpProtocolHandler.ts)

**Purpose**: MCP protocol logic and capability aggregation

**Responsibilities**:

- Aggregate capabilities from all registered servers
- Add namespace prefixes to tools/prompts
- Route requests to appropriate backend
- Strip namespaces before backend calls

**Implementation**:

```typescript
export const listTools = async (gateway: Gateway): Promise<Tool[]> => {
  const servers = gateway.registry.listServers();
  const tools: Tool[] = [];

  for (const server of servers) {
    const serverTools = await gateway.client.listTools(server);
    for (const tool of serverTools) {
      tools.push({
        ...tool,
        name: `${server.id}.${tool.name}`, // Add namespace prefix
      });
    }
  }

  return tools;
};

export const callTool = async (
  gateway: Gateway,
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> => {
  const [serverId, bareToolName] = toolName.split('.', 2);
  const server = gateway.registry.getServer(serverId);

  return gateway.client.callTool(server, bareToolName, input);
};
```

### 3. BackendMcpClient (src/client/BackendMcpClient.ts)

**Purpose**: HTTP communication with backend MCP servers

**Responsibilities**:

- Execute tool calls with retry logic
- Read resources from backends
- Get prompts from backends
- Health checking
- Error handling and recovery

**Implementation**:

```typescript
export const callTool = async (
  server: ServerRegistration,
  toolName: string,
  input: Record<string, unknown>,
  retries = 3
): Promise<unknown> => {
  const url = new URL(server.endpoint);
  url.pathname = '/mcp/tools/call';

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, input }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      // Exponential backoff: 100ms, 200ms, 400ms
      await new Promise((resolve) =>
        setTimeout(resolve, 100 * Math.pow(2, attempt))
      );
    }
  }
};

export const checkHealth = async (
  server: ServerRegistration
): Promise<ServerHealth> => {
  const url = new URL(server.endpoint);
  url.pathname = '/health';

  try {
    const start = Date.now();
    const response = await fetch(url.toString());
    const latency = Date.now() - start;

    return {
      status: response.ok ? 'HEALTHY' : 'DEGRADED',
      latency,
      lastCheck: new Date(),
      errorMessage: undefined,
    };
  } catch (err) {
    return {
      status: 'DOWN',
      latency: 0,
      lastCheck: new Date(),
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};
```

### 4. ServerRegistry (src/registry/ServerRegistry.ts)

**Purpose**: Server registration, discovery, and health tracking

**Responsibilities**:

- Register/unregister servers
- List all servers
- Filter healthy servers
- Resolve servers by tool/resource/prompt name
- Update server health status

**Implementation**:

```typescript
export interface ServerRegistration {
  id: string; // Unique server ID
  name: string; // Display name
  endpoint: string; // Backend URL
  health: ServerHealth;
  registeredAt?: Date;
}

export class ServerRegistry {
  private servers = new Map<string, ServerRegistration>();

  register(server: ServerRegistration): void {
    this.servers.set(server.id, server);
  }

  listServers(): ServerRegistration[] {
    return Array.from(this.servers.values());
  }

  getHealthyServers(): ServerRegistration[] {
    return this.listServers().filter((s) => s.health.status === 'HEALTHY');
  }

  getServer(id: string): ServerRegistration {
    const server = this.servers.get(id);
    if (!server) throw new Error(`Server not found: ${id}`);
    return server;
  }

  updateHealth(id: string, health: ServerHealth): void {
    const server = this.servers.get(id);
    if (server) {
      server.health = health;
    }
  }
}
```

### 5. ResponseCache (src/cache/ResponseCache.ts)

**Purpose**: Response caching with TTL management

**Note**: Currently implemented as in-memory Map. Can be extended with deno
Blobs or Redis.

**Implementation**:

```typescript
export class ResponseCache {
  private cache = new Map<string, { data: unknown; expires: number }>();

  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  set(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttlMs,
    });
  }

  generateKey(operation: string, name: string, input: unknown): string {
    const hash = new TextEncoder().encode(
      `${operation}:${name}:${JSON.stringify(input)}`
    );
    return btoa(String.fromCharCode(...hash));
  }
}
```

**Future Enhancements**:

- Use deno Blobs for persistent cache
- Implement Cache-Control headers
- Add cache invalidation strategies
- Support Redis for multi-instance deployments

              properties.getRouting().getRetry().getBackoffMultiplier(),
              properties.getRouting().getRetry().getMaxDelay()
          )
          .build();

  }

````

### 7. ServerHealthMonitor
## Domain Models

### ServerRegistration (src/types/server.ts)

```typescript
export interface ServerRegistration {
  id: string; // Unique server ID
  name: string; // Display name
  endpoint: string; // Backend URL
  health: ServerHealth;
  registeredAt?: Date;
}
````

### ServerHealth (src/types/server.ts)

```typescript
export interface ServerHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  lastCheck: Date;
  latency: number; // milliseconds
  errorMessage?: string;
}
```

### Tool & Resource (src/types/mcp.ts)

```typescript
export interface Tool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface Resource {
  uri: string;
  name?: string;
  description?: string;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; type: string }>;
}
```

## Design Decisions

### 1. deno Edge Functions

**Decision**: Deploy on deno Edge Functions instead of traditional container/VM
infrastructure

**Rationale**:

- **Global Distribution**: Automatic deployment to 100+ edge locations
- **Low Latency**: Requests served from nearest geographic location
- **Zero Ops**: Fully managed infrastructure, no servers to maintain
- **Auto-Scaling**: Handles traffic spikes automatically
- **Cost-Effective**: Pay-per-use pricing

**Trade-offs**:

- Limited to synchronous request/response model
- Edge Function execution timeout (few seconds)
- No persistent storage on edge (use deno Blobs or backend)
- Deno runtime limitations (subset of Node.js APIs)

### 2. Framework-Free Routing (Route Table Pattern)

**Decision**: Explicit route table instead of Hono or Express

**Rationale**:

- **Lightweight**: No framework overhead, minimal bundle size
- **Control**: Full control over request/response handling
- **Portability**: Easy to migrate to Hono, Cloudflare Workers, or Deno Deploy
- **Performance**: Regex-based routing is efficient at edge
- **Transparency**: Routes are easy to understand and debug

**Trade-offs**:

- More boilerplate than framework
- Manual middleware management
- No built-in features (compression, caching headers, etc.)

**Migration Path**:

- Can add Hono with minimal refactoring
- Route handlers are framework-agnostic
- Would only require import changes

### 3. TypeScript + Deno Runtime

**Decision**: Use TypeScript on Deno for edge function implementation

**Rationale**:

- **Type Safety**: Full TypeScript support prevents runtime errors
- **Deno Security**: Sandboxed execution, explicit permissions
- **Web-Compatible**: Native Web API support (fetch, Request, Response)
- **Modern Runtime**: ES2022+ support, no transpilation needed
- **No node_modules**: Deno uses URLs for dependencies

**Trade-offs**:

- Deno ecosystem smaller than Node.js
- Some popular npm packages not available
- Learning curve for developers familiar with Node.js

### 4. Namespace Prefixing

**Decision**: Add server ID prefix to tool/prompt names (e.g.,
`journey.findTrips`)

**Rationale**:

- Avoid naming conflicts between servers
- Clear attribution of capabilities
- Support for future multi-instance backends

**Format**: `{server-id}.{tool-name}`

**Examples**:

- `journey.findTrips`
- `mobility.getTripPricing`
- `aareguru.getCurrentConditions`

### 5. Retry with Exponential Backoff

**Decision**: Retry failed backend calls with exponential backoff

**Rationale**:

- Handle transient network failures
- Reduce load on struggling backends
- Improve overall success rate

**Implementation**:

```typescript
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 100;
const BACKOFF_MULTIPLIER = 2;

// Each attempt waits: 100ms, 200ms, 400ms
```

## Configuration

### deno.toml

```toml
[build]
  publish = "public"

[[edge_functions]]
  function = "mcp"
  path = "/mcp/*"

[dev]
  port = 8888
```

### src/config.ts

```typescript
export interface GatewayConfig {
  servers: ServerConfig[];
  cache?: {
    ttlMs: number;
    maxEntries: number;
  };
}

export interface ServerConfig {
  id: string;
  name: string;
  endpoint: string;
}

export const loadConfig = (): GatewayConfig => ({
  servers: [
    {
      id: 'journey-service',
      name: 'Journey Service',
      endpoint: Deno.env.get('JOURNEY_SERVICE_URL') || 'http://localhost:3001',
    },
    // ... more servers
  ],
  cache: {
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxEntries: 1000,
  },
});
```

### Environment Variables

Set in deno dashboard > Site settings > Build & deploy > Environment:

- `JOURNEY_SERVICE_URL`: Journey Service backend endpoint
- `SWISS_MOBILITY_URL`: Swiss Mobility backend endpoint
- `AAREGURU_URL`: Aareguru backend endpoint
- `OPEN_METEO_URL`: Open Meteo backend endpoint
- `DEBUG`: Enable debug logging (optional)

## Performance Characteristics

### Latency

- **Cached Response**: ~50-100ms (edge location to user)
- **Uncached Response**: ~200-500ms (edge → backend → edge)
- **Edge Location Benefit**: ~10-100ms faster than traditional single-region
  deployment

### Throughput

- **Concurrent Requests**: Limited by deno Edge Functions quotas
- **Scalability**: Automatic, handled by deno infrastructure
- **No manual scaling needed**: Serverless auto-scales with traffic

### Resource Usage

- **Memory**: Minimal (Deno runtime optimized)
- **CPU**: Pay-per-use, metered by deno
- **Bandwidth**: Charged per GB egress

### deno Pricing Tier

- **Free**: 1M requests/month included
- **Pro**: $19/month + overages
- **Enterprise**: Custom pricing

See [deno Pricing](https://www.deno.com/pricing/) for details.

## Security Considerations

### Current State

- ✅ Public access (no authentication required)
- ✅ Basic request validation
- ⚠️ No rate limiting
- ⚠️ No input validation beyond JSON parsing

### Recommendations for Production

1. **Authentication**:

   - Add API key header validation
   - Implement OAuth if needed
   - Use deno Functions for auth middleware

2. **Rate Limiting**:

   - Implement per-IP rate limiting
   - Use deno Functions or external service

3. **Input Validation**:

   - Validate request schemas
   - Sanitize user input
   - Implement timeout limits

4. **Secrets Management**:

   - Use deno environment variables for backend URLs
   - Never commit secrets to git
   - Use separate credentials per environment

5. **Network Security**:
   - Restrict backend endpoints to deno IP ranges
   - Use HTTPS for all backend communication
   - Consider VPN/private networks for sensitive backends

## Monitoring & Observability

### Metrics Available

- **Request count**: Total requests to gateway
- **Response time**: P50, P95, P99 latencies
- **Error rate**: 4xx, 5xx response counts
- **Backend health**: Status of each backend server
- **Cache hit rate**: Percentage of responses from cache

### Logging

```typescript
// Error logging
console.error(`[ERROR] ${message}`, { error, context });

// Info logging
console.log(`[INFO] Tool call: ${toolName}`);

// Debug logging (when DEBUG=true)
if (Deno.env.get('DEBUG')) {
  console.debug(`[DEBUG] Response: ${JSON.stringify(response)}`);
}
```

### Access via deno Dashboard

- View logs in deno dashboard
- Monitor usage and bandwidth
- Track error rates
- Check deployment history

### Recommended Alerts

- Error rate > 5%
- P95 latency > 1000ms
- All backends unhealthy
- Frequent timeouts

### Future Enhancements

- Integrate with datadog/new-relic
- Add distributed tracing
- Implement custom metrics
- Set up analytics dashboard

## Middleware & Security

### Rate Limiting (src/middleware/RateLimiter.ts)

**Purpose**: Prevent abuse and ensure fair resource allocation

**Features**:

- Per-IP rate limiting with configurable limits
- Configurable time windows (default: 60 seconds)
- Configurable request limits (default: 100 requests/minute)
- Automatic cleanup of expired entries
- Returns `429 Too Many Requests` when limit exceeded
- Includes `Retry-After` and rate limit headers in response

**Usage**:

```typescript
const rateLimiter = createRateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});
```

### Request Validation (src/validation/RequestValidator.ts)

**Purpose**: Validate incoming requests before processing

**Features**:

- Type-safe validation for tool calls, resources, and prompts
- Schema validation with detailed error messages
- JSON parsing with error handling
- Tool name format validation (namespace.toolname)
- URI validation for resource requests
- Argument object validation

**Validation Functions**:

```typescript
validateToolCall(data) // Validates tool call requests
validateResourceRead(data) // Validates resource read requests
validatePromptGet(data) // Validates prompt requests
```

## Monitoring & Observability

### Metrics Collection (src/monitoring/MetricsCollector.ts)

**Purpose**: Collect real-time gateway metrics for monitoring

**Metrics Collected**:

- Total requests and errors
- Cache hit rate
- Average response latency
- Requests and errors per minute
- Gateway uptime
- Backend service health (per-server)
- Backend success rates and latencies

**Access Metrics**:

```typescript
const metrics = globalMetrics.getMetrics();
const summary = globalMetrics.getSummary();
```

### Monitoring Dashboard (public/dashboard.html)

**Purpose**: Visual interface for monitoring gateway health

**Features**:

- Real-time metrics display
- Backend service health status
- Error rate tracking
- Cache hit rate monitoring
- Response latency metrics
- Auto-refresh every 10 seconds
- Responsive mobile-friendly design

**Access**: Visit `/dashboard` in your browser

## Future Enhancements

### Short Term (Q1 2026)

1. ✅ Add interactive web UI for testing
2. ✅ Mobile-optimized UI design for small screens
3. ✅ Implement request validation schemas
4. ✅ Add basic rate limiting
5. ✅ Set up monitoring dashboard

### Medium Term (Q2 2026)

1. ⬜ Implement distributed caching (deno Blobs)
2. ⬜ Add authentication/API keys
3. ⬜ Support backend server health dashboards
4. ⬜ Implement circuit breaker pattern

### Long Term (Q3-Q4 2026)

1. ⬜ Migrate to Hono framework (if needed)
2. ⬜ Add distributed tracing
3. ⬜ Support multiple deployment platforms
4. ⬜ Advanced analytics and insights

## References

- [Model Context Protocol](https://modelcontextprotocol.io)
- [deno Edge Functions](https://docs.deno.com/edge-functions/overview/)
- [Deno Runtime](https://deno.land/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Project Repository](https://github.com/schlpbch/deno-mcp-gateway)
- [Live Deployment](https://netliy-deno-mcp-gateway.deno.app)

```
- [Google Cloud Run](https://cloud.google.com/run)
```
