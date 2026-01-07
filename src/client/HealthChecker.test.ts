import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { HealthChecker } from './HealthChecker.ts';
import { SessionManager } from './SessionManager.ts';
import type { RoutingConfig } from '../types/config.ts';
import type { ServerRegistration } from '../types/server.ts';
import { HealthStatus, TransportType } from '../types/server.ts';

/**
 * Tests for HealthChecker
 */

function createMockConfig(): RoutingConfig {
  return {
    timeout: {
      connect: 5000,
      read: 30000,
    },
    retry: {
      maxAttempts: 3,
      backoffDelay: 100,
      backoffMultiplier: 2,
      maxDelay: 5000,
    },
  };
}

function createMockServer(
  id: string,
  endpoint: string = 'https://example.com/mcp'
): ServerRegistration {
  return {
    id,
    name: `Test Server ${id}`,
    endpoint,
    transport: TransportType.HTTP,
    capabilities: { tools: [], resources: [], prompts: [] },
    health: {
      status: HealthStatus.UNKNOWN,
      lastCheck: new Date(),
      latency: 0,
      consecutiveFailures: 0,
    },
    priority: 1,
    registeredAt: new Date(),
  };
}

// Mock fetch responses
let mockFetchResponses: Map<
  string,
  { ok: boolean; status: number; headers: Map<string, string> }
> = new Map();

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; options: RequestInit }> = [];

function setupMockFetch() {
  fetchCalls = [];
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url, options: init || {} });

    const response = mockFetchResponses.get(url) || {
      ok: false,
      status: 404,
      headers: new Map(),
    };

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.ok ? 'OK' : 'Error',
      headers: {
        get: (name: string) => response.headers.get(name) || null,
      },
      text: async () => '{}',
      json: async () => ({}),
    } as Response;
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  mockFetchResponses = new Map();
  fetchCalls = [];
}

// ================== HEALTH CHECKER TESTS ==================

Deno.test('HealthChecker - returns HEALTHY when actuator returns 200', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);

    assertEquals(health.status, HealthStatus.HEALTHY);
    assertEquals(health.consecutiveFailures, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - constructs correct actuator URL for /mcp endpoint', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://api.example.com/actuator/health', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://api.example.com/mcp');

    await checker.checkHealth(server);

    assertEquals(
      fetchCalls.some((c) =>
        c.url.includes('https://api.example.com/actuator/health')
      ),
      true
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - constructs correct actuator URL for root endpoint', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://api.example.com/actuator/health', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://api.example.com');

    await checker.checkHealth(server);

    assertEquals(
      fetchCalls.some((c) =>
        c.url.includes('https://api.example.com/actuator/health')
      ),
      true
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - falls back to MCP when actuator returns 404', async () => {
  setupMockFetch();
  try {
    // Actuator returns 404
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: false,
      status: 404,
      headers: new Map(),
    });
    // MCP returns 200
    mockFetchResponses.set('https://example.com/mcp', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);

    assertEquals(health.status, HealthStatus.HEALTHY);
    assertEquals(fetchCalls.length, 2); // Both actuator and MCP called
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - falls back to MCP when actuator throws error', async () => {
  setupMockFetch();
  try {
    // MCP returns 200
    mockFetchResponses.set('https://example.com/mcp', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    // Override fetch to throw for actuator URL
    const mockFetch = globalThis.fetch;
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('actuator')) {
        throw new Error('Network error');
      }
      return mockFetch(input, init);
    };

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);

    assertEquals(health.status, HealthStatus.HEALTHY);
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - MCP fallback stores session ID when returned', async () => {
  setupMockFetch();
  try {
    // Actuator fails
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: false,
      status: 404,
      headers: new Map(),
    });
    // MCP returns with session
    mockFetchResponses.set('https://example.com/mcp', {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'health-check-session']]),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    await checker.checkHealth(server);

    assertEquals(sessionManager.getSession('server-1'), 'health-check-session');
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - returns DEGRADED when MCP returns non-OK response', async () => {
  setupMockFetch();
  try {
    // Actuator fails
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: false,
      status: 404,
      headers: new Map(),
    });
    // MCP returns 500
    mockFetchResponses.set('https://example.com/mcp', {
      ok: false,
      status: 500,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);

    assertEquals(health.status, HealthStatus.DEGRADED);
    assertEquals(health.errorMessage, 'MCP HTTP 500');
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - returns DOWN when MCP throws error', async () => {
  setupMockFetch();
  try {
    // Both endpoints fail
    globalThis.fetch = async () => {
      throw new Error('Connection refused');
    };

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);

    assertEquals(health.status, HealthStatus.DOWN);
    assertEquals(health.errorMessage, 'Connection refused');
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - records latency from actuator check', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);

    assertEquals(typeof health.latency, 'number');
    assertEquals(health.latency >= 0, true);
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - records latency from MCP fallback', async () => {
  setupMockFetch();
  try {
    // Actuator fails
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: false,
      status: 404,
      headers: new Map(),
    });
    // MCP succeeds
    mockFetchResponses.set('https://example.com/mcp', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);

    assertEquals(typeof health.latency, 'number');
    assertEquals(health.latency >= 0, true);
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - sends correct MCP initialize request', async () => {
  setupMockFetch();
  try {
    // Actuator fails
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: false,
      status: 404,
      headers: new Map(),
    });
    // MCP succeeds
    mockFetchResponses.set('https://example.com/mcp', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    await checker.checkHealth(server);

    const mcpCall = fetchCalls.find((c) => c.url === 'https://example.com/mcp');
    assertEquals(mcpCall !== undefined, true);
    assertEquals(mcpCall?.options.method, 'POST');

    const body = JSON.parse(mcpCall?.options.body as string);
    assertEquals(body.jsonrpc, '2.0');
    assertEquals(body.method, 'initialize');
    assertEquals(body.params.protocolVersion, '2024-11-05');
    assertEquals(body.params.clientInfo.name, 'netlify-mcp-gateway-health');
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - includes correct headers in MCP request', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: false,
      status: 404,
      headers: new Map(),
    });
    mockFetchResponses.set('https://example.com/mcp', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    await checker.checkHealth(server);

    const mcpCall = fetchCalls.find((c) => c.url === 'https://example.com/mcp');
    const headers = mcpCall?.options.headers as Record<string, string>;
    assertEquals(headers['Content-Type'], 'application/json');
    assertEquals(headers['Accept'], 'application/json, text/event-stream');
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - resets consecutiveFailures on success', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');
    server.health.consecutiveFailures = 5; // Had previous failures

    const health = await checker.checkHealth(server);

    assertEquals(health.consecutiveFailures, 0);
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - increments consecutiveFailures on MCP failure', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: false,
      status: 404,
      headers: new Map(),
    });
    mockFetchResponses.set('https://example.com/mcp', {
      ok: false,
      status: 500,
      headers: new Map(),
    });

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');
    server.health.consecutiveFailures = 2;

    const health = await checker.checkHealth(server);

    assertEquals(health.consecutiveFailures, 3);
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - increments consecutiveFailures on network error', async () => {
  setupMockFetch();
  try {
    globalThis.fetch = async () => {
      throw new Error('Connection refused');
    };

    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');
    server.health.consecutiveFailures = 1;

    const health = await checker.checkHealth(server);

    assertEquals(health.consecutiveFailures, 2);
  } finally {
    restoreFetch();
  }
});

Deno.test('HealthChecker - lastCheck is set to current time', async () => {
  setupMockFetch();
  try {
    mockFetchResponses.set('https://example.com/actuator/health', {
      ok: true,
      status: 200,
      headers: new Map(),
    });

    const before = new Date();
    const sessionManager = new SessionManager(createMockConfig());
    const checker = new HealthChecker(createMockConfig(), sessionManager);
    const server = createMockServer('server-1', 'https://example.com/mcp');

    const health = await checker.checkHealth(server);
    const after = new Date();

    assertEquals(health.lastCheck >= before, true);
    assertEquals(health.lastCheck <= after, true);
  } finally {
    restoreFetch();
  }
});
