/**
 * Unit tests for MCP Gateway
 * Tests core functionality including routing, aggregation, and error handling
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { handler } from './main.ts';

// =============================================================================
// Health Endpoint Tests
// =============================================================================

Deno.test('Health endpoint returns 200 OK', async () => {
  const req = new Request('http://localhost:8000/health');
  const res = await handler(req);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Content-Type'), 'application/json');

  const body = await res.json();
  assertExists(body.status);
  assertExists(body.server);
  assertExists(body.backends);
});

Deno.test('Health endpoint includes backend server status', async () => {
  const req = new Request('http://localhost:8000/health');
  const res = await handler(req);
  const body = await res.json();

  assertEquals(Array.isArray(body.backends), true);
  // Should have at least journey, aareguru, open-meteo
  assertEquals(body.backends.length >= 3, true);
});

// =============================================================================
// Metrics Endpoint Tests
// =============================================================================

Deno.test('Metrics endpoint returns valid metrics', async () => {
  const req = new Request('http://localhost:8000/metrics');
  const res = await handler(req);

  assertEquals(res.status, 200);
  const body = await res.json();

  assertExists(body.uptime);
  assertExists(body.totalRequests);
  assertExists(body.totalErrors);
  assertExists(body.errorRate);
});

// =============================================================================
// CORS Tests
// =============================================================================

Deno.test('CORS preflight request returns 204', async () => {
  const req = new Request('http://localhost:8000/mcp/tools/list', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:1337',
      'Access-Control-Request-Method': 'GET',
    },
  });
  const res = await handler(req);

  assertEquals(res.status, 204);
  assertExists(res.headers.get('Access-Control-Allow-Origin'));
  assertExists(res.headers.get('Access-Control-Allow-Methods'));
});

Deno.test('CORS headers are present on API responses', async () => {
  const req = new Request('http://localhost:8000/health', {
    headers: { Origin: 'http://localhost:1337' },
  });
  const res = await handler(req);

  assertExists(res.headers.get('Access-Control-Allow-Origin'));
});

// =============================================================================
// MCP Tools List Tests
// =============================================================================

Deno.test('Tools list endpoint returns tools array', async () => {
  const req = new Request('http://localhost:8000/mcp/tools/list');
  const res = await handler(req);

  assertEquals(res.status, 200);
  const body = await res.json();

  assertExists(body.tools);
  assertEquals(Array.isArray(body.tools), true);
});

Deno.test('Tools have namespace prefixes', async () => {
  const req = new Request('http://localhost:8000/mcp/tools/list');
  const res = await handler(req);
  const body = await res.json();

  if (body.tools && body.tools.length > 0) {
    const tool = body.tools[0];
    assertExists(tool.name);
    // Tool names should have namespace prefix (e.g., "journey__", "aareguru__")
    assertEquals(tool.name.includes('__'), true);
  }
});

// =============================================================================
// MCP Resources List Tests
// =============================================================================

Deno.test('Resources list endpoint returns resources array', async () => {
  const req = new Request('http://localhost:8000/mcp/resources/list');
  const res = await handler(req);

  assertEquals(res.status, 200);
  const body = await res.json();

  assertExists(body.resources);
  assertEquals(Array.isArray(body.resources), true);
});

// =============================================================================
// MCP Prompts List Tests
// =============================================================================

Deno.test('Prompts list endpoint returns prompts array', async () => {
  const req = new Request('http://localhost:8000/mcp/prompts/list');
  const res = await handler(req);

  assertEquals(res.status, 200);
  const body = await res.json();

  assertExists(body.prompts);
  assertEquals(Array.isArray(body.prompts), true);
});

// =============================================================================
// Error Handling Tests
// =============================================================================

Deno.test('404 for unknown paths', async () => {
  const req = new Request('http://localhost:8000/unknown/path');
  const res = await handler(req);

  assertEquals(res.status, 404);
});

Deno.test('Invalid JSON in POST request returns error', async () => {
  const req = new Request('http://localhost:8000/mcp/tools/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'invalid json',
  });

  // Should handle gracefully
  const res = await handler(req);
  assertEquals(res.status >= 400, true);
});

// =============================================================================
// Rate Limiting Tests
// =============================================================================

Deno.test('Rate limiting blocks excessive requests', async () => {
  const requests = [];

  // Send 150 requests (limit is 100/min)
  for (let i = 0; i < 150; i++) {
    const req = new Request('http://localhost:8000/health', {
      headers: { 'x-forwarded-for': '192.168.1.100' },
    });
    requests.push(handler(req));
  }

  const responses = await Promise.all(requests);
  const rateLimited = responses.filter((r) => r.status === 429);

  // Should have at least some rate-limited responses
  assertEquals(rateLimited.length > 0, true);
});

// =============================================================================
// Authentication Tests (when API key is set)
// =============================================================================

Deno.test(
  'Protected endpoints require auth when API key is configured',
  async () => {
    // Set API key temporarily
    const originalKey = Deno.env.get('MCP_API_KEY');
    Deno.env.set('MCP_API_KEY', 'test-key-123');

    try {
      const req = new Request('http://localhost:8000/mcp/tools/list');
      const res = await handler(req);

      // Should return 401 without auth header
      assertEquals(res.status, 401);
    } finally {
      // Restore original state
      if (originalKey) {
        Deno.env.set('MCP_API_KEY', originalKey);
      } else {
        Deno.env.delete('MCP_API_KEY');
      }
    }
  }
);

Deno.test('Valid API key allows access to protected endpoints', async () => {
  const originalKey = Deno.env.get('MCP_API_KEY');
  Deno.env.set('MCP_API_KEY', 'test-key-123');

  try {
    const req = new Request('http://localhost:8000/mcp/tools/list', {
      headers: { Authorization: 'Bearer test-key-123' },
    });
    const res = await handler(req);

    // Should succeed with valid key
    assertEquals(res.status, 200);
  } finally {
    if (originalKey) {
      Deno.env.set('MCP_API_KEY', originalKey);
    } else {
      Deno.env.delete('MCP_API_KEY');
    }
  }
});
