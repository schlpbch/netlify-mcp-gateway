import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { HealthStatus, TransportType } from '../types/server.ts';
import type { ServerRegistration, ServerHealth } from '../types/server.ts';
import type { RoutingConfig } from '../types/config.ts';

/**
 * Tests for two-tier health check strategy in BackendMcpClient.
 * 1. First tries Spring Boot actuator endpoint (/actuator/health)
 * 2. Falls back to MCP-based health check (initialize request)
 */

function createMockServer(
  id: string = 'test-server',
  endpoint: string = 'https://test-server.example.com/mcp',
  consecutiveFailures: number = 0
): ServerRegistration {
  return {
    id,
    name: `Test Server ${id}`,
    endpoint,
    transport: TransportType.HTTP,
    capabilities: {
      tools: ['tool1', 'tool2'],
      resources: [],
      prompts: [],
    },
    health: {
      status: HealthStatus.HEALTHY,
      lastCheck: new Date(),
      latency: 100,
      consecutiveFailures,
    },
    priority: 1,
    registeredAt: new Date(),
  };
}

function createMockConfig(): RoutingConfig {
  return {
    retry: {
      maxAttempts: 3,
      backoffDelay: 10,
      backoffMultiplier: 2.0,
      maxDelay: 100,
    },
    timeout: {
      connect: 5000,
      read: 30000,
    },
  };
}

interface MockFetchCall {
  url: string;
  options: RequestInit;
}

interface MockResponse {
  ok: boolean;
  status: number;
  headers: Map<string, string>;
  body: string;
  shouldThrow?: boolean;
  errorMessage?: string;
}

/**
 * Test client that simulates two-tier health check
 */
class HealthCheckTestClient {
  public fetchCalls: MockFetchCall[] = [];
  public mockResponses: MockResponse[] = [];
  private responseIndex = 0;
  private sessions: Map<string, string> = new Map();
  private requestId = 0;

  constructor(private config: RoutingConfig) {}

  setMockResponses(responses: MockResponse[]): void {
    this.mockResponses = responses;
    this.responseIndex = 0;
  }

  private async mockFetch(url: string, options: RequestInit): Promise<{
    ok: boolean;
    status: number;
    headers: { get: (name: string) => string | null };
    text: () => Promise<string>;
  }> {
    this.fetchCalls.push({ url, options });
    const response = this.mockResponses[this.responseIndex] || {
      ok: true,
      status: 200,
      headers: new Map(),
      body: '{}',
    };
    this.responseIndex++;

    if (response.shouldThrow) {
      throw new Error(response.errorMessage || 'Network error');
    }

    return {
      ok: response.ok,
      status: response.status,
      headers: {
        get: (name: string) => response.headers.get(name) || null,
      },
      text: () => Promise.resolve(response.body),
    };
  }

  async checkHealth(server: ServerRegistration): Promise<ServerHealth> {
    const startTime = Date.now();

    // First, try Spring Boot actuator health endpoint
    try {
      const actuatorUrl = server.endpoint.endsWith('/mcp')
        ? server.endpoint.replace('/mcp', '/actuator/health')
        : `${server.endpoint}/actuator/health`;

      const response = await this.mockFetch(actuatorUrl, {
        method: 'GET',
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          status: HealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency,
          consecutiveFailures: 0,
        };
      }
    } catch {
      // Actuator failed, try MCP-based health check
    }

    // Fall back to MCP-based health check (ping via initialize)
    return await this.checkHealthViaMcp(server, startTime);
  }

  private async checkHealthViaMcp(
    server: ServerRegistration,
    startTime: number
  ): Promise<ServerHealth> {
    try {
      const request = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'netlify-mcp-gateway-health', version: '1.0.0' },
        },
        id: ++this.requestId,
      };

      const response = await this.mockFetch(server.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(request),
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        // Store session if returned
        const sessionId = response.headers.get('mcp-session-id');
        if (sessionId) {
          this.sessions.set(server.id, sessionId);
        }

        return {
          status: HealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency,
          consecutiveFailures: 0,
        };
      } else {
        return {
          status: HealthStatus.DEGRADED,
          lastCheck: new Date(),
          latency,
          errorMessage: `MCP HTTP ${response.status}`,
          consecutiveFailures: server.health.consecutiveFailures + 1,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: HealthStatus.DOWN,
        lastCheck: new Date(),
        latency,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: server.health.consecutiveFailures + 1,
      };
    }
  }

  getStoredSession(serverId: string): string | undefined {
    return this.sessions.get(serverId);
  }
}

// ================== ACTUATOR TESTS ==================

Deno.test('Health - returns HEALTHY when actuator returns 200', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer(
    'journey-service-mcp',
    'https://journey.example.com/mcp'
  );

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({ status: 'UP' }),
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(health.status, HealthStatus.HEALTHY);
  assertEquals(health.consecutiveFailures, 0);
  assertEquals(client.fetchCalls.length, 1);
  assertEquals(
    client.fetchCalls[0].url,
    'https://journey.example.com/actuator/health'
  );
});

Deno.test('Health - constructs correct actuator URL for /mcp endpoint', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://server.example.com/mcp');

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({ status: 'UP' }),
    },
  ]);

  await client.checkHealth(server);

  assertEquals(
    client.fetchCalls[0].url,
    'https://server.example.com/actuator/health'
  );
});

Deno.test('Health - constructs correct actuator URL for root endpoint', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://server.example.com');

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({ status: 'UP' }),
    },
  ]);

  await client.checkHealth(server);

  assertEquals(
    client.fetchCalls[0].url,
    'https://server.example.com/actuator/health'
  );
});

// ================== MCP FALLBACK TESTS ==================

Deno.test('Health - falls back to MCP when actuator returns 404', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('aareguru-mcp', 'https://aareguru.fastmcp.app/mcp');

  client.setMockResponses([
    // Actuator returns 404
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
    },
    // MCP initialize succeeds
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(health.status, HealthStatus.HEALTHY);
  assertEquals(client.fetchCalls.length, 2);
  assertEquals(
    client.fetchCalls[1].url,
    'https://aareguru.fastmcp.app/mcp'
  );
});

Deno.test('Health - falls back to MCP when actuator throws error', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp');

  client.setMockResponses([
    // Actuator throws network error
    {
      ok: false,
      status: 0,
      headers: new Map(),
      body: '',
      shouldThrow: true,
      errorMessage: 'Connection refused',
    },
    // MCP initialize succeeds
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(health.status, HealthStatus.HEALTHY);
  assertEquals(client.fetchCalls.length, 2);
});

Deno.test('Health - MCP fallback stores session ID when returned', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer(
    'journey-service-mcp',
    'https://journey.example.com/mcp'
  );

  client.setMockResponses([
    // Actuator returns 404
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
    },
    // MCP initialize succeeds with session
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'health-session-123']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
  ]);

  await client.checkHealth(server);

  assertEquals(
    client.getStoredSession('journey-service-mcp'),
    'health-session-123'
  );
});

Deno.test('Health - returns DEGRADED when MCP returns non-OK response', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp', 1);

  client.setMockResponses([
    // Actuator fails
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
    },
    // MCP returns 503
    {
      ok: false,
      status: 503,
      headers: new Map(),
      body: JSON.stringify({ error: 'Service unavailable' }),
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(health.status, HealthStatus.DEGRADED);
  assertEquals(health.errorMessage, 'MCP HTTP 503');
  assertEquals(health.consecutiveFailures, 2); // Was 1, now 2
});

Deno.test('Health - returns DOWN when MCP throws error', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp', 2);

  client.setMockResponses([
    // Actuator fails
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
      shouldThrow: true,
      errorMessage: 'Network error',
    },
    // MCP also throws
    {
      ok: false,
      status: 0,
      headers: new Map(),
      body: '',
      shouldThrow: true,
      errorMessage: 'Connection timeout',
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(health.status, HealthStatus.DOWN);
  assertEquals(health.errorMessage, 'Connection timeout');
  assertEquals(health.consecutiveFailures, 3); // Was 2, now 3
});

// ================== LATENCY TESTS ==================

Deno.test('Health - records latency from actuator check', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp');

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({ status: 'UP' }),
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(typeof health.latency, 'number');
  assertEquals(health.latency >= 0, true);
});

Deno.test('Health - records latency from MCP fallback', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp');

  client.setMockResponses([
    // Actuator fails
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
    },
    // MCP succeeds
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(typeof health.latency, 'number');
  assertEquals(health.latency >= 0, true);
});

// ================== MCP REQUEST FORMAT TESTS ==================

Deno.test('Health - sends correct MCP initialize request', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp');

  client.setMockResponses([
    // Actuator fails
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
    },
    // MCP succeeds
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
  ]);

  await client.checkHealth(server);

  const mcpCall = client.fetchCalls[1];
  const body = JSON.parse(mcpCall.options.body as string);

  assertEquals(body.jsonrpc, '2.0');
  assertEquals(body.method, 'initialize');
  assertEquals(body.params.protocolVersion, '2024-11-05');
  assertEquals(body.params.clientInfo.name, 'netlify-mcp-gateway-health');
});

Deno.test('Health - includes correct headers in MCP request', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp');

  client.setMockResponses([
    // Actuator fails
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
    },
    // MCP succeeds
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
  ]);

  await client.checkHealth(server);

  const mcpCall = client.fetchCalls[1];
  const headers = mcpCall.options.headers as Record<string, string>;

  assertEquals(headers['Content-Type'], 'application/json');
  assertEquals(headers['Accept'], 'application/json, text/event-stream');
});

// ================== CONSECUTIVE FAILURES TESTS ==================

Deno.test('Health - resets consecutiveFailures on success', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp', 5);

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({ status: 'UP' }),
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(health.consecutiveFailures, 0);
});

Deno.test('Health - increments consecutiveFailures on failure', async () => {
  const client = new HealthCheckTestClient(createMockConfig());
  const server = createMockServer('test', 'https://test.example.com/mcp', 3);

  client.setMockResponses([
    {
      ok: false,
      status: 404,
      headers: new Map(),
      body: 'Not Found',
    },
    {
      ok: false,
      status: 500,
      headers: new Map(),
      body: 'Internal Server Error',
    },
  ]);

  const health = await client.checkHealth(server);

  assertEquals(health.consecutiveFailures, 4);
});
