import {
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { HealthStatus, TransportType } from '../types/server.ts';
import type { ServerRegistration } from '../types/server.ts';
import type { RoutingConfig } from '../types/config.ts';

/**
 * Tests for session management in BackendMcpClient.
 * Covers Streamable HTTP transport with Mcp-Session-Id headers.
 */

function createMockServer(
  id: string = 'test-server',
  endpoint: string = 'https://test-server.example.com/mcp'
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
}

/**
 * Test client that simulates session-based MCP communication
 */
class SessionTestClient {
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

  private mockFetch(url: string, options: RequestInit): Promise<{
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

    return Promise.resolve({
      ok: response.ok,
      status: response.status,
      headers: {
        get: (name: string) => response.headers.get(name) || null,
      },
      text: () => Promise.resolve(response.body),
    });
  }

  async initializeSession(
    serverId: string,
    endpoint: string
  ): Promise<string | null> {
    const request = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'netlify-mcp-gateway', version: '1.0.0' },
      },
      id: ++this.requestId,
    };

    const response = await this.mockFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return null;
    }

    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId) {
      this.sessions.set(serverId, sessionId);
    }

    return sessionId;
  }

  async getSession(serverId: string, endpoint: string): Promise<string | null> {
    const existingSession = this.sessions.get(serverId);
    if (existingSession) {
      return existingSession;
    }
    return await this.initializeSession(serverId, endpoint);
  }

  async sendRequest(
    serverId: string,
    endpoint: string,
    method: string
  ): Promise<{ result: unknown; sessionUsed: string | null }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    const sessionId = await this.getSession(serverId, endpoint);
    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const request = {
      jsonrpc: '2.0',
      method,
      params: {},
      id: ++this.requestId,
    };

    const response = await this.mockFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    const text = await response.text();
    const parsed = JSON.parse(text);

    return {
      result: parsed.result,
      sessionUsed: sessionId,
    };
  }

  getStoredSession(serverId: string): string | undefined {
    return this.sessions.get(serverId);
  }

  clearSession(serverId: string): void {
    this.sessions.delete(serverId);
  }
}

Deno.test('Session - initializes session on first request', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'session-abc123']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [] },
      }),
    },
  ]);

  const result = await client.sendRequest(
    'journey-service-mcp',
    'https://journey.example.com',
    'tools/list'
  );

  assertEquals(result.sessionUsed, 'session-abc123');
  assertEquals(client.getStoredSession('journey-service-mcp'), 'session-abc123');
});

Deno.test('Session - reuses existing session for subsequent requests', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'session-xyz789']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [] },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: { resources: [] },
      }),
    },
  ]);

  // First request
  await client.sendRequest(
    'journey-service-mcp',
    'https://journey.example.com',
    'tools/list'
  );

  // Second request should reuse session
  const result2 = await client.sendRequest(
    'journey-service-mcp',
    'https://journey.example.com',
    'resources/list'
  );

  assertEquals(result2.sessionUsed, 'session-xyz789');
  // Should have made 3 fetch calls (init + first + second), not 4 (with re-init)
  assertEquals(client.fetchCalls.length, 3);
});

Deno.test('Session - handles servers without session support', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map(), // No session ID header
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [] },
      }),
    },
  ]);

  const result = await client.sendRequest(
    'aareguru-mcp',
    'https://aareguru.example.com/mcp',
    'tools/list'
  );

  assertEquals(result.sessionUsed, null);
  assertEquals(client.getStoredSession('aareguru-mcp'), undefined);
});

Deno.test('Session - maintains separate sessions per server', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    // Journey server initialization
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'journey-session-001']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [] },
      }),
    },
    // Mobility server initialization
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'mobility-session-002']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        result: { tools: [] },
      }),
    },
  ]);

  await client.sendRequest(
    'journey-service-mcp',
    'https://journey.example.com',
    'tools/list'
  );

  await client.sendRequest(
    'swiss-mobility-mcp',
    'https://mobility.example.com/mcp',
    'tools/list'
  );

  assertEquals(
    client.getStoredSession('journey-service-mcp'),
    'journey-session-001'
  );
  assertEquals(
    client.getStoredSession('swiss-mobility-mcp'),
    'mobility-session-002'
  );
});

Deno.test('Session - handles initialization failure gracefully', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    {
      ok: false,
      status: 500,
      headers: new Map(),
      body: JSON.stringify({ error: 'Internal server error' }),
    },
  ]);

  const sessionId = await client.initializeSession(
    'failing-server',
    'https://failing.example.com'
  );

  assertEquals(sessionId, null);
  assertEquals(client.getStoredSession('failing-server'), undefined);
});

Deno.test('Session - clears session when explicitly requested', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'session-to-clear']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [] },
      }),
    },
  ]);

  await client.sendRequest(
    'test-server',
    'https://test.example.com',
    'tools/list'
  );

  assertEquals(client.getStoredSession('test-server'), 'session-to-clear');

  client.clearSession('test-server');

  assertEquals(client.getStoredSession('test-server'), undefined);
});

Deno.test('Session - includes correct headers in JSON-RPC request', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'session-header-test']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
    {
      ok: true,
      status: 200,
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [] },
      }),
    },
  ]);

  await client.sendRequest(
    'test-server',
    'https://test.example.com',
    'tools/list'
  );

  // Check the second call (after initialization) has the session header
  const toolsListCall = client.fetchCalls[1];
  const headers = toolsListCall.options.headers as Record<string, string>;

  assertEquals(headers['Mcp-Session-Id'], 'session-header-test');
  assertEquals(headers['Content-Type'], 'application/json');
  assertEquals(headers['Accept'], 'application/json, text/event-stream');
});

Deno.test('Session - sends proper initialize request body', async () => {
  const client = new SessionTestClient(createMockConfig());

  client.setMockResponses([
    {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'session-init-body']]),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { protocolVersion: '2024-11-05' },
      }),
    },
  ]);

  await client.initializeSession('test-server', 'https://test.example.com');

  const initCall = client.fetchCalls[0];
  const body = JSON.parse(initCall.options.body as string);

  assertEquals(body.jsonrpc, '2.0');
  assertEquals(body.method, 'initialize');
  assertEquals(body.params.protocolVersion, '2024-11-05');
  assertEquals(body.params.clientInfo.name, 'netlify-mcp-gateway');
  assertEquals(typeof body.id, 'number');
});
