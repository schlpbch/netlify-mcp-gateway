import {
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
// import { stub, assertSpyCalls } from 'https://deno.land/std@0.208.0/testing/mock.ts';
import { HealthStatus, TransportType } from '../types/server.ts';
import type { ServerRegistration } from '../types/server.ts';
import type { RoutingConfig } from '../types/config.ts';

function createMockServer(
  id: string = 'test-server',
  healthStatus: HealthStatus = HealthStatus.HEALTHY
): ServerRegistration {
  return {
    id,
    name: `Test Server ${id}`,
    endpoint: 'https://test-server.example.com/mcp',
    transport: TransportType.HTTP,
    capabilities: {
      tools: ['tool1', 'tool2'],
      resources: [],
      prompts: [],
    },
    health: {
      status: healthStatus,
      lastCheck: new Date(),
      latency: 100,
      consecutiveFailures: 0,
    },
    priority: 1,
    registeredAt: new Date(),
  };
}

function createMockConfig(): RoutingConfig {
  return {
    retry: {
      maxAttempts: 3,
      backoffDelay: 10, // Short delay for tests
      backoffMultiplier: 2.0,
      maxDelay: 100,
    },
    timeout: {
      connect: 5000,
      read: 30000,
    },
  };
}

// Simplified BackendMcpClient for testing without actual fetch
class TestableBackendMcpClient {
  public fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  public mockResponses: Array<{ ok: boolean; status: number; data: unknown }> = [];
  private responseIndex = 0;

  constructor(private config: RoutingConfig) {}

  setMockResponses(responses: Array<{ ok: boolean; status: number; data: unknown }>): void {
    this.mockResponses = responses;
    this.responseIndex = 0;
  }

  private mockFetch(url: string, _options: RequestInit): Promise<Response> {
    this.fetchCalls.push({ url, options });
    const response = this.mockResponses[this.responseIndex] || { ok: true, status: 200, data: {} };
    this.responseIndex++;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        statusText: 'Error',
        json: () => Promise.resolve(response.data),
      } as Response;
    }

    return {
      ok: true,
      status: response.status,
      statusText: 'OK',
      json: () => Promise.resolve(response.data),
    } as Response;
  }

  async callTool(
    server: ServerRegistration,
    toolName: string,
    args?: Record<string, unknown>
  ) {
    return await this.retryRequest(async () => {
      const response = await this.mockFetch(`${server.endpoint}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: toolName, arguments: args }),
      });

      if (!response.ok) {
        throw new Error(`Tool call failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    });
  }

  async readResource(server: ServerRegistration, uri: string) {
    return await this.retryRequest(async () => {
      const response = await this.mockFetch(`${server.endpoint}/resources/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      });

      if (!response.ok) {
        throw new Error(`Resource read failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    });
  }

  async getPrompt(
    server: ServerRegistration,
    promptName: string,
    args?: Record<string, unknown>
  ) {
    return await this.retryRequest(async () => {
      const response = await this.mockFetch(`${server.endpoint}/prompts/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: promptName, arguments: args }),
      });

      if (!response.ok) {
        throw new Error(`Prompt get failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    });
  }

  async listTools(server: ServerRegistration) {
    const response = await this.mockFetch(`${server.endpoint}/tools/list`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`List tools failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async listResources(server: ServerRegistration) {
    const response = await this.mockFetch(`${server.endpoint}/resources/list`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`List resources failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async listPrompts(server: ServerRegistration) {
    const response = await this.mockFetch(`${server.endpoint}/prompts/list`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`List prompts failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async checkHealth(server: ServerRegistration) {
    const startTime = Date.now();

    try {
      const response = await this.mockFetch(
        `${server.endpoint.replace('/mcp', '')}/actuator/health`,
        { method: 'GET' }
      );

      const latency = Date.now() - startTime;

      if (response.ok) {
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
          errorMessage: `HTTP ${response.status}`,
          consecutiveFailures: server.health.consecutiveFailures + 1,
        };
      }
    } catch (error) {
      return {
        status: HealthStatus.DOWN,
        lastCheck: new Date(),
        latency: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: server.health.consecutiveFailures + 1,
      };
    }
  }

  private async retryRequest<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.config.retry.maxAttempts - 1) {
          break;
        }

        const delay = Math.min(
          this.config.retry.backoffDelay * Math.pow(this.config.retry.backoffMultiplier, attempt),
          this.config.retry.maxDelay
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Request failed after retries');
  }
}

Deno.test('BackendMcpClient - callTool sends correct request', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([
    { ok: true, status: 200, data: { content: [{ type: 'text', text: 'result' }] } },
  ]);

  await client.callTool(server, 'findTrips', { from: 'A', to: 'B' });

  assertEquals(client.fetchCalls.length, 1);
  assertEquals(client.fetchCalls[0].url, 'https://test-server.example.com/mcp/tools/call');
  assertEquals(client.fetchCalls[0].options.method, 'POST');

  const body = JSON.parse(client.fetchCalls[0].options.body as string);
  assertEquals(body.name, 'findTrips');
  assertEquals(body.arguments, { from: 'A', to: 'B' });
});

Deno.test('BackendMcpClient - callTool retries on failure', async () => {
  const config = createMockConfig();
  config.retry.maxAttempts = 3;
  const client = new TestableBackendMcpClient(config);
  const server = createMockServer();

  client.setMockResponses([
    { ok: false, status: 500, data: {} },
    { ok: false, status: 500, data: {} },
    { ok: true, status: 200, data: { content: [{ type: 'text', text: 'success' }] } },
  ]);

  const result = await client.callTool(server, 'findTrips');

  assertEquals(client.fetchCalls.length, 3);
  assertEquals(result.content[0].text, 'success');
});

Deno.test('BackendMcpClient - callTool throws after max retries', async () => {
  const config = createMockConfig();
  config.retry.maxAttempts = 2;
  const client = new TestableBackendMcpClient(config);
  const server = createMockServer();

  client.setMockResponses([
    { ok: false, status: 500, data: {} },
    { ok: false, status: 500, data: {} },
  ]);

  await assertRejects(
    () => client.callTool(server, 'findTrips'),
    Error,
    'Tool call failed'
  );
});

Deno.test('BackendMcpClient - readResource sends correct request', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([
    { ok: true, status: 200, data: { contents: [{ uri: 'test://resource', text: 'content' }] } },
  ]);

  await client.readResource(server, 'test://resource');

  assertEquals(client.fetchCalls[0].url, 'https://test-server.example.com/mcp/resources/read');
  const body = JSON.parse(client.fetchCalls[0].options.body as string);
  assertEquals(body.uri, 'test://resource');
});

Deno.test('BackendMcpClient - getPrompt sends correct request', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([
    { ok: true, status: 200, data: { messages: [{ role: 'user', content: { type: 'text', text: 'prompt' } }] } },
  ]);

  await client.getPrompt(server, 'tripPlanner', { city: 'Zurich' });

  assertEquals(client.fetchCalls[0].url, 'https://test-server.example.com/mcp/prompts/get');
  const body = JSON.parse(client.fetchCalls[0].options.body as string);
  assertEquals(body.name, 'tripPlanner');
  assertEquals(body.arguments, { city: 'Zurich' });
});

Deno.test('BackendMcpClient - listTools sends GET request', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([
    { ok: true, status: 200, data: { tools: [{ name: 'tool1' }, { name: 'tool2' }] } },
  ]);

  const result = await client.listTools(server);

  assertEquals(client.fetchCalls[0].url, 'https://test-server.example.com/mcp/tools/list');
  assertEquals(client.fetchCalls[0].options.method, 'GET');
  assertEquals(result.tools.length, 2);
});

Deno.test('BackendMcpClient - listResources sends GET request', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([
    { ok: true, status: 200, data: { resources: [{ uri: 'res://1', name: 'Resource 1' }] } },
  ]);

  await client.listResources(server);

  assertEquals(client.fetchCalls[0].url, 'https://test-server.example.com/mcp/resources/list');
  assertEquals(client.fetchCalls[0].options.method, 'GET');
});

Deno.test('BackendMcpClient - listPrompts sends GET request', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([
    { ok: true, status: 200, data: { prompts: [{ name: 'prompt1' }] } },
  ]);

  await client.listPrompts(server);

  assertEquals(client.fetchCalls[0].url, 'https://test-server.example.com/mcp/prompts/list');
  assertEquals(client.fetchCalls[0].options.method, 'GET');
});

Deno.test('BackendMcpClient - checkHealth returns HEALTHY on success', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([{ ok: true, status: 200, data: { status: 'UP' } }]);

  const health = await client.checkHealth(server);

  assertEquals(health.status, HealthStatus.HEALTHY);
  assertEquals(health.consecutiveFailures, 0);
});

Deno.test('BackendMcpClient - checkHealth returns DEGRADED on non-OK response', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();

  client.setMockResponses([{ ok: false, status: 503, data: {} }]);

  const health = await client.checkHealth(server);

  assertEquals(health.status, HealthStatus.DEGRADED);
  assertEquals(health.consecutiveFailures, 1);
  assertEquals(health.errorMessage, 'HTTP 503');
});

Deno.test('BackendMcpClient - checkHealth increments consecutiveFailures', async () => {
  const client = new TestableBackendMcpClient(createMockConfig());
  const server = createMockServer();
  server.health.consecutiveFailures = 2;

  client.setMockResponses([{ ok: false, status: 500, data: {} }]);

  const health = await client.checkHealth(server);

  assertEquals(health.consecutiveFailures, 3);
});
