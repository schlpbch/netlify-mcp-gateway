import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { JsonRpcClient } from './JsonRpcClient.ts';
import { SessionManager } from './SessionManager.ts';
import type { RoutingConfig } from '../types/config.ts';

/**
 * Tests for JsonRpcClient
 */

function createMockConfig(): RoutingConfig {
  return {
    timeout: {
      connect: 5000,
      read: 30000,
    },
    retry: {
      maxAttempts: 3,
      backoffDelay: 10, // Short delay for tests
      backoffMultiplier: 2,
      maxDelay: 100,
    },
  };
}

// Mock fetch responses
let mockFetchResponse: {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Map<string, string>;
  body: string;
} = {
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Map(),
  body: '{}',
};

let fetchCallCount = 0;
let lastFetchRequest: { url: string; options: RequestInit } | null = null;
const originalFetch = globalThis.fetch;

function setupMockFetch() {
  fetchCallCount = 0;
  lastFetchRequest = null;
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    fetchCallCount++;
    const url = typeof input === 'string' ? input : input.toString();
    lastFetchRequest = { url, options: init || {} };

    return {
      ok: mockFetchResponse.ok,
      status: mockFetchResponse.status,
      statusText: mockFetchResponse.statusText,
      headers: {
        get: (name: string) => mockFetchResponse.headers.get(name) || null,
      },
      text: async () => mockFetchResponse.body,
      json: async () => JSON.parse(mockFetchResponse.body),
    } as Response;
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  mockFetchResponse = {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map(),
    body: '{}',
  };
  fetchCallCount = 0;
  lastFetchRequest = null;
}

// ================== JSON-RPC CLIENT TESTS ==================

Deno.test('JsonRpcClient - send sends correct JSON-RPC request', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data: 'test' } }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await client.send('https://example.com/mcp', 'tools/list', { filter: 'all' });

    const body = JSON.parse(lastFetchRequest?.options.body as string);
    assertEquals(body.jsonrpc, '2.0');
    assertEquals(body.method, 'tools/list');
    assertEquals(body.params.filter, 'all');
    assertEquals(typeof body.id, 'number');
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send returns result from response', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: ['tool1', 'tool2'] } }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    const result = await client.send<{ tools: string[] }>('https://example.com/mcp', 'tools/list');

    assertEquals(result.tools, ['tool1', 'tool2']);
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send includes correct headers', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await client.send('https://example.com/mcp', 'test');

    const headers = lastFetchRequest?.options.headers as Record<string, string>;
    assertEquals(headers['Content-Type'], 'application/json');
    assertEquals(headers['Accept'], 'application/json, text/event-stream');
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send throws on HTTP error', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Map(),
      body: 'Server error',
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await assertRejects(
      async () => client.send('https://example.com/mcp', 'test'),
      Error,
      'Request failed: 500'
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send throws on JSON-RPC error', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32600, message: 'Invalid Request' },
      }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await assertRejects(
      async () => client.send('https://example.com/mcp', 'test'),
      Error,
      'JSON-RPC error: Invalid Request'
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send throws when no result in response', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1 }), // No result
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await assertRejects(
      async () => client.send('https://example.com/mcp', 'test'),
      Error,
      'No result in JSON-RPC response'
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send parses SSE format response', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"sse":"works"}}',
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    const result = await client.send<{ sse: string }>('https://example.com/mcp', 'test');

    assertEquals(result.sse, 'works');
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send adds session header when serverId provided', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['mcp-session-id', 'new-session']]),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    sessionManager.setSession('server-1', 'existing-session');
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await client.send('https://example.com/mcp', 'test', {}, undefined, 'server-1');

    const headers = lastFetchRequest?.options.headers as Record<string, string>;
    assertEquals(headers['Mcp-Session-Id'], 'existing-session');
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - sendWithRetry retries on failure', async () => {
  setupMockFetch();
  try {
    let callCount = 0;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      callCount++;
      if (callCount < 3) {
        return {
          ok: false,
          status: 500,
          statusText: 'Error',
          headers: { get: () => null },
          text: async () => 'Error',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { success: true } }),
      } as unknown as Response;
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    const result = await client.sendWithRetry<{ success: boolean }>(
      'https://example.com/mcp',
      'test'
    );

    assertEquals(result.success, true);
    assertEquals(callCount, 3);
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - sendWithRetry throws after max retries', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: false,
      status: 500,
      statusText: 'Error',
      headers: new Map(),
      body: 'Error',
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await assertRejects(
      async () => client.sendWithRetry('https://example.com/mcp', 'test'),
      Error
    );

    assertEquals(fetchCallCount, 3); // maxAttempts = 3
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send handles session expiry and retry', async () => {
  setupMockFetch();
  try {
    let callCount = 0;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      callCount++;
      const url = typeof input === 'string' ? input : input.toString();

      // First call fails with session error
      if (callCount === 1) {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          headers: { get: () => null },
          text: async () => 'Invalid Mcp-Session-Id',
        } as unknown as Response;
      }

      // Session initialization
      if (callCount === 2) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: (name: string) => name === 'mcp-session-id' ? 'new-session' : null },
          text: async () => '{}',
        } as unknown as Response;
      }

      // Retry succeeds
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { retried: true } }),
      } as unknown as Response;
    };

    const sessionManager = new SessionManager(createMockConfig());
    sessionManager.setSession('server-1', 'old-session');
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    const result = await client.send<{ retried: boolean }>(
      'https://example.com/mcp',
      'test',
      {},
      undefined,
      'server-1'
    );

    assertEquals(result.retried, true);
    assertEquals(sessionManager.getSession('server-1'), 'new-session');
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send uses method parameter correctly', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await client.send('https://example.com/mcp', 'tools/call');

    const body = JSON.parse(lastFetchRequest?.options.body as string);
    assertEquals(body.method, 'tools/call');
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send handles empty params', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await client.send('https://example.com/mcp', 'test');

    const body = JSON.parse(lastFetchRequest?.options.body as string);
    assertEquals(body.params, undefined);
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send handles complex nested result', async () => {
  setupMockFetch();
  try {
    const complexResult = {
      tools: [
        { name: 'tool1', description: 'First tool', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Second tool', inputSchema: { type: 'string' } },
      ],
      metadata: { count: 2, page: 1 },
    };

    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: complexResult }),
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    const result = await client.send<typeof complexResult>('https://example.com/mcp', 'test');

    assertEquals(result.tools.length, 2);
    assertEquals(result.tools[0].name, 'tool1');
    assertEquals(result.metadata.count, 2);
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - send throws on invalid SSE format', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: 'event: message\nno-data-line-here',
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    await assertRejects(
      async () => client.send('https://example.com/mcp', 'test'),
      Error,
      'Could not parse SSE response'
    );
  } finally {
    restoreFetch();
  }
});

Deno.test('JsonRpcClient - sendWithRetry uses exponential backoff', async () => {
  setupMockFetch();
  try {
    const timestamps: number[] = [];
    globalThis.fetch = async () => {
      timestamps.push(Date.now());
      return {
        ok: false,
        status: 500,
        statusText: 'Error',
        headers: { get: () => null },
        text: async () => 'Error',
      } as unknown as Response;
    };

    const sessionManager = new SessionManager(createMockConfig());
    const client = new JsonRpcClient(createMockConfig(), sessionManager);

    try {
      await client.sendWithRetry('https://example.com/mcp', 'test');
    } catch {
      // Expected to fail
    }

    // Verify delays between attempts (backoffDelay=10, multiplier=2)
    // First retry after ~10ms, second retry after ~20ms
    if (timestamps.length >= 3) {
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      // Allow some tolerance for timing
      assertEquals(delay1 >= 5, true); // Should be ~10ms
      assertEquals(delay2 >= delay1, true); // Should increase
    }
  } finally {
    restoreFetch();
  }
});
