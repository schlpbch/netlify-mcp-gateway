import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';

/**
 * Tests for SSE (Server-Sent Events) response parsing in BackendMcpClient.
 * MCP servers can return responses in either plain JSON or SSE format.
 */

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Parse SSE response format to extract JSON-RPC response.
 * Handles both plain JSON and SSE "event: message\ndata: {...}" format.
 */
function parseSSEResponse<T>(text: string): JsonRpcResponse<T> {
  // Try parsing as plain JSON first
  try {
    return JSON.parse(text);
  } catch {
    // Parse SSE format
  }

  // Parse SSE format: "event: message\ndata: {...}"
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const jsonStr = line.substring(6);
      return JSON.parse(jsonStr);
    }
  }

  throw new Error('Could not parse SSE response');
}

// ================== PLAIN JSON TESTS ==================

Deno.test('SSE - parses plain JSON response', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { tools: [{ name: 'tool1' }] },
  });

  const parsed = parseSSEResponse<{ tools: { name: string }[] }>(response);

  assertEquals(parsed.jsonrpc, '2.0');
  assertEquals(parsed.id, 1);
  assertEquals(parsed.result?.tools.length, 1);
  assertEquals(parsed.result?.tools[0].name, 'tool1');
});

Deno.test('SSE - parses plain JSON with error', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    error: { code: -32601, message: 'Method not found' },
  });

  const parsed = parseSSEResponse<unknown>(response);

  assertEquals(parsed.jsonrpc, '2.0');
  assertEquals(parsed.id, 2);
  assertEquals(parsed.error?.code, -32601);
  assertEquals(parsed.error?.message, 'Method not found');
});

Deno.test('SSE - parses plain JSON with null result', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    result: null,
  });

  const parsed = parseSSEResponse<null>(response);

  assertEquals(parsed.result, null);
});

Deno.test('SSE - parses plain JSON with empty object result', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    result: {},
  });

  const parsed = parseSSEResponse<Record<string, unknown>>(response);

  assertEquals(parsed.result, {});
});

// ================== SSE FORMAT TESTS ==================

Deno.test('SSE - parses SSE format with data line', () => {
  const response = `event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}`;

  const parsed = parseSSEResponse<{ tools: unknown[] }>(response);

  assertEquals(parsed.jsonrpc, '2.0');
  assertEquals(parsed.id, 1);
  assertEquals(parsed.result?.tools, []);
});

Deno.test('SSE - parses SSE format with multiple event lines', () => {
  const response = `event: message
id: 123
retry: 5000
data: {"jsonrpc":"2.0","id":5,"result":{"status":"success"}}`;

  const parsed = parseSSEResponse<{ status: string }>(response);

  assertEquals(parsed.result?.status, 'success');
});

Deno.test('SSE - parses SSE format with complex nested result', () => {
  const toolsResult = {
    tools: [
      { name: 'findTrips', description: 'Find train trips' },
      { name: 'getStations', description: 'Get station info' },
    ],
  };

  const response = `event: message
data: ${JSON.stringify({ jsonrpc: '2.0', id: 6, result: toolsResult })}`;

  const parsed = parseSSEResponse<typeof toolsResult>(response);

  assertEquals(parsed.result?.tools.length, 2);
  assertEquals(parsed.result?.tools[0].name, 'findTrips');
  assertEquals(parsed.result?.tools[1].description, 'Get station info');
});

Deno.test('SSE - parses SSE format with error response', () => {
  const response = `event: message
data: {"jsonrpc":"2.0","id":7,"error":{"code":-32600,"message":"Invalid Request"}}`;

  const parsed = parseSSEResponse<unknown>(response);

  assertEquals(parsed.error?.code, -32600);
  assertEquals(parsed.error?.message, 'Invalid Request');
});

Deno.test('SSE - handles SSE with blank lines', () => {
  const response = `event: message

data: {"jsonrpc":"2.0","id":8,"result":{"value":"test"}}

`;

  const parsed = parseSSEResponse<{ value: string }>(response);

  assertEquals(parsed.result?.value, 'test');
});

Deno.test('SSE - handles SSE with Windows line endings', () => {
  const response = `event: message\r\ndata: {"jsonrpc":"2.0","id":9,"result":{"ok":true}}`;

  // Note: This test checks that split('\n') handles \r\n correctly
  // Since we split on \n, the \r will remain at the end of "event: message"
  // but the data line should still parse correctly
  const parsed = parseSSEResponse<{ ok: boolean }>(response);

  assertEquals(parsed.result?.ok, true);
});

Deno.test('SSE - takes first data line when multiple present', () => {
  const response = `event: message
data: {"jsonrpc":"2.0","id":10,"result":{"first":true}}
data: {"jsonrpc":"2.0","id":11,"result":{"second":true}}`;

  const parsed = parseSSEResponse<{ first?: boolean; second?: boolean }>(response);

  assertEquals(parsed.result?.first, true);
  assertEquals(parsed.id, 10);
});

// ================== ERROR CASES ==================

Deno.test('SSE - throws for invalid JSON', () => {
  assertThrows(
    () => parseSSEResponse('not valid json'),
    Error,
    'Could not parse SSE response'
  );
});

Deno.test('SSE - throws for empty string', () => {
  assertThrows(
    () => parseSSEResponse(''),
    Error,
    'Could not parse SSE response'
  );
});

Deno.test('SSE - throws for SSE without data line', () => {
  const response = `event: message
id: 123
retry: 5000`;

  assertThrows(
    () => parseSSEResponse(response),
    Error,
    'Could not parse SSE response'
  );
});

Deno.test('SSE - throws for invalid JSON in data line', () => {
  const response = `event: message
data: {not valid json}`;

  assertThrows(() => parseSSEResponse(response), SyntaxError);
});

// ================== EDGE CASES ==================

Deno.test('SSE - handles data line with colon in value', () => {
  const response = `event: message
data: {"jsonrpc":"2.0","id":12,"result":{"url":"https://example.com:8080/path"}}`;

  const parsed = parseSSEResponse<{ url: string }>(response);

  assertEquals(parsed.result?.url, 'https://example.com:8080/path');
});

Deno.test('SSE - handles data line with special characters', () => {
  const result = {
    text: 'Hello "world" with\nnewlines and\ttabs',
  };
  const response = `event: message
data: ${JSON.stringify({ jsonrpc: '2.0', id: 13, result })}`;

  const parsed = parseSSEResponse<typeof result>(response);

  assertEquals(parsed.result?.text, 'Hello "world" with\nnewlines and\ttabs');
});

Deno.test('SSE - handles unicode in response', () => {
  const result = {
    city: 'Zürich',
    emoji: '🚂',
    japanese: 'こんにちは',
  };
  const response = `event: message
data: ${JSON.stringify({ jsonrpc: '2.0', id: 14, result })}`;

  const parsed = parseSSEResponse<typeof result>(response);

  assertEquals(parsed.result?.city, 'Zürich');
  assertEquals(parsed.result?.emoji, '🚂');
  assertEquals(parsed.result?.japanese, 'こんにちは');
});

Deno.test('SSE - handles large response payload', () => {
  const largeArray = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    name: `Tool ${i}`,
    description: `Description for tool ${i}`,
  }));

  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 15,
    result: { tools: largeArray },
  });

  const parsed = parseSSEResponse<{ tools: typeof largeArray }>(response);

  assertEquals(parsed.result?.tools.length, 1000);
  assertEquals(parsed.result?.tools[500].name, 'Tool 500');
});

Deno.test('SSE - handles nested objects in result', () => {
  const complexResult = {
    trip: {
      from: { name: 'Zürich HB', coordinates: { lat: 47.3769, lon: 8.5417 } },
      to: { name: 'Bern', coordinates: { lat: 46.948, lon: 7.4474 } },
      segments: [
        { type: 'train', duration: 56 },
        { type: 'walk', duration: 5 },
      ],
    },
  };

  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 16,
    result: complexResult,
  });

  const parsed = parseSSEResponse<typeof complexResult>(response);

  assertEquals(parsed.result?.trip.from.name, 'Zürich HB');
  assertEquals(parsed.result?.trip.to.coordinates.lat, 46.948);
  assertEquals(parsed.result?.trip.segments.length, 2);
});

Deno.test('SSE - handles arrays as result', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 17,
    result: ['item1', 'item2', 'item3'],
  });

  const parsed = parseSSEResponse<string[]>(response);

  assertEquals(parsed.result?.length, 3);
  assertEquals(parsed.result?.[0], 'item1');
});

Deno.test('SSE - handles boolean result', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 18,
    result: true,
  });

  const parsed = parseSSEResponse<boolean>(response);

  assertEquals(parsed.result, true);
});

Deno.test('SSE - handles number result', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 19,
    result: 42.5,
  });

  const parsed = parseSSEResponse<number>(response);

  assertEquals(parsed.result, 42.5);
});

Deno.test('SSE - handles string result', () => {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id: 20,
    result: 'simple string result',
  });

  const parsed = parseSSEResponse<string>(response);

  assertEquals(parsed.result, 'simple string result');
});
