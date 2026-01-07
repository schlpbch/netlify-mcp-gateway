import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { SessionManager } from './SessionManager.ts';
import type { RoutingConfig } from '../types/config.ts';

/**
 * Tests for SessionManager
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

// Mock fetch for testing
let mockFetchResponse: {
  ok: boolean;
  status: number;
  headers: Map<string, string>;
} = {
  ok: true,
  status: 200,
  headers: new Map(),
};

let lastFetchRequest: { url: string; options: RequestInit } | null = null;

const originalFetch = globalThis.fetch;

function setupMockFetch() {
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    lastFetchRequest = { url, options: init || {} };

    return {
      ok: mockFetchResponse.ok,
      status: mockFetchResponse.status,
      headers: {
        get: (name: string) => mockFetchResponse.headers.get(name) || null,
      },
      text: async () => '{}',
      json: async () => ({}),
    } as Response;
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
  lastFetchRequest = null;
  mockFetchResponse = { ok: true, status: 200, headers: new Map() };
}

// ================== SESSION MANAGER TESTS ==================

Deno.test('SessionManager - getSession returns undefined for unknown server', () => {
  const manager = new SessionManager(createMockConfig());
  assertEquals(manager.getSession('unknown-server'), undefined);
});

Deno.test('SessionManager - setSession stores session', () => {
  const manager = new SessionManager(createMockConfig());
  manager.setSession('server-1', 'session-abc');
  assertEquals(manager.getSession('server-1'), 'session-abc');
});

Deno.test('SessionManager - setSession overwrites existing session', () => {
  const manager = new SessionManager(createMockConfig());
  manager.setSession('server-1', 'session-abc');
  manager.setSession('server-1', 'session-xyz');
  assertEquals(manager.getSession('server-1'), 'session-xyz');
});

Deno.test('SessionManager - clearSession removes session', () => {
  const manager = new SessionManager(createMockConfig());
  manager.setSession('server-1', 'session-abc');
  manager.clearSession('server-1');
  assertEquals(manager.getSession('server-1'), undefined);
});

Deno.test('SessionManager - clearSession does not throw for unknown server', () => {
  const manager = new SessionManager(createMockConfig());
  // Should not throw
  manager.clearSession('unknown-server');
  assertEquals(manager.getSession('unknown-server'), undefined);
});

Deno.test('SessionManager - maintains separate sessions per server', () => {
  const manager = new SessionManager(createMockConfig());
  manager.setSession('server-1', 'session-1');
  manager.setSession('server-2', 'session-2');
  manager.setSession('server-3', 'session-3');

  assertEquals(manager.getSession('server-1'), 'session-1');
  assertEquals(manager.getSession('server-2'), 'session-2');
  assertEquals(manager.getSession('server-3'), 'session-3');
});

Deno.test('SessionManager - nextRequestId increments', () => {
  const manager = new SessionManager(createMockConfig());

  const id1 = manager.nextRequestId();
  const id2 = manager.nextRequestId();
  const id3 = manager.nextRequestId();

  assertEquals(id2, id1 + 1);
  assertEquals(id3, id2 + 1);
});

Deno.test('SessionManager - nextRequestId is unique across calls', () => {
  const manager = new SessionManager(createMockConfig());
  const ids = new Set<number>();

  for (let i = 0; i < 100; i++) {
    ids.add(manager.nextRequestId());
  }

  assertEquals(ids.size, 100);
});

Deno.test('SessionManager - getOrInitializeSession returns existing session', async () => {
  const manager = new SessionManager(createMockConfig());
  manager.setSession('server-1', 'existing-session');

  const session = await manager.getOrInitializeSession(
    'server-1',
    'https://example.com/mcp'
  );

  assertEquals(session, 'existing-session');
});

Deno.test('SessionManager - initializeSession sends correct request', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'new-session-123']]),
    };

    const manager = new SessionManager(createMockConfig());
    const session = await manager.initializeSession(
      'server-1',
      'https://example.com/mcp'
    );

    assertEquals(session, 'new-session-123');
    assertEquals(lastFetchRequest?.url, 'https://example.com/mcp');
    assertEquals(lastFetchRequest?.options.method, 'POST');

    const body = JSON.parse(lastFetchRequest?.options.body as string);
    assertEquals(body.jsonrpc, '2.0');
    assertEquals(body.method, 'initialize');
    assertEquals(body.params.protocolVersion, '2024-11-05');
    assertEquals(body.params.clientInfo.name, 'netlify-mcp-gateway');
  } finally {
    restoreFetch();
  }
});

Deno.test('SessionManager - initializeSession stores session on success', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'stored-session']]),
    };

    const manager = new SessionManager(createMockConfig());
    await manager.initializeSession('server-1', 'https://example.com/mcp');

    assertEquals(manager.getSession('server-1'), 'stored-session');
  } finally {
    restoreFetch();
  }
});

Deno.test('SessionManager - initializeSession returns null on HTTP error', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: false,
      status: 500,
      headers: new Map(),
    };

    const manager = new SessionManager(createMockConfig());
    const session = await manager.initializeSession(
      'server-1',
      'https://example.com/mcp'
    );

    assertEquals(session, null);
  } finally {
    restoreFetch();
  }
});

Deno.test('SessionManager - initializeSession returns null on network error', async () => {
  setupMockFetch();
  try {
    globalThis.fetch = async () => {
      throw new Error('Network error');
    };

    const manager = new SessionManager(createMockConfig());
    const session = await manager.initializeSession(
      'server-1',
      'https://example.com/mcp'
    );

    assertEquals(session, null);
  } finally {
    restoreFetch();
  }
});

Deno.test('SessionManager - initializeSession returns null when no session header', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      headers: new Map(), // No mcp-session-id header
    };

    const manager = new SessionManager(createMockConfig());
    const session = await manager.initializeSession(
      'server-1',
      'https://example.com/mcp'
    );

    assertEquals(session, null);
  } finally {
    restoreFetch();
  }
});

Deno.test('SessionManager - getOrInitializeSession initializes when no session', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'initialized-session']]),
    };

    const manager = new SessionManager(createMockConfig());
    const session = await manager.getOrInitializeSession(
      'server-1',
      'https://example.com/mcp'
    );

    assertEquals(session, 'initialized-session');
    assertEquals(manager.getSession('server-1'), 'initialized-session');
  } finally {
    restoreFetch();
  }
});

Deno.test('SessionManager - initializeSession uses custom timeout', async () => {
  setupMockFetch();
  try {
    mockFetchResponse = {
      ok: true,
      status: 200,
      headers: new Map([['mcp-session-id', 'test-session']]),
    };

    const manager = new SessionManager(createMockConfig());
    await manager.initializeSession(
      'server-1',
      'https://example.com/mcp',
      10000
    );

    // Verify fetch was called (timeout is internal to AbortSignal)
    assertEquals(lastFetchRequest !== null, true);
  } finally {
    restoreFetch();
  }
});

Deno.test('SessionManager - request IDs are positive integers', () => {
  const manager = new SessionManager(createMockConfig());

  for (let i = 0; i < 10; i++) {
    const id = manager.nextRequestId();
    assertEquals(id > 0, true);
    assertEquals(Number.isInteger(id), true);
  }
});
