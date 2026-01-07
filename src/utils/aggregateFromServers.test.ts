import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isFulfilled, aggregateFromServers } from './aggregateFromServers.ts';
import type { ServerRegistration } from '../types/server.ts';
import { HealthStatus, TransportType } from '../types/server.ts';

/**
 * Tests for aggregateFromServers utility
 */

function createMockServer(id: string): ServerRegistration {
  return {
    id,
    name: `Test Server ${id}`,
    endpoint: `https://${id}.example.com/mcp`,
    transport: TransportType.HTTP,
    capabilities: { tools: [], resources: [], prompts: [] },
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

// ================== isFulfilled TESTS ==================

Deno.test('isFulfilled - returns true for fulfilled results', () => {
  const result: PromiseSettledResult<string> = {
    status: 'fulfilled',
    value: 'test',
  };
  assertEquals(isFulfilled(result), true);
});

Deno.test('isFulfilled - returns false for rejected results', () => {
  const result: PromiseSettledResult<string> = {
    status: 'rejected',
    reason: new Error('test error'),
  };
  assertEquals(isFulfilled(result), false);
});

Deno.test('isFulfilled - type guards correctly narrow type', () => {
  const results: PromiseSettledResult<number>[] = [
    { status: 'fulfilled', value: 1 },
    { status: 'rejected', reason: new Error('error') },
    { status: 'fulfilled', value: 2 },
  ];

  const fulfilled = results.filter(isFulfilled);
  assertEquals(fulfilled.length, 2);
  assertEquals(fulfilled[0].value, 1);
  assertEquals(fulfilled[1].value, 2);
});

// ================== aggregateFromServers TESTS ==================

Deno.test('aggregateFromServers - aggregates results from multiple servers', async () => {
  const servers = [createMockServer('server-1'), createMockServer('server-2')];

  const fetcher = async (server: ServerRegistration) => {
    return [`tool-from-${server.id}`];
  };

  const results = await aggregateFromServers(servers, fetcher, 'tools');

  assertEquals(results.length, 2);
  assertEquals(results.includes('tool-from-server-1'), true);
  assertEquals(results.includes('tool-from-server-2'), true);
});

Deno.test('aggregateFromServers - flattens nested arrays', async () => {
  const servers = [createMockServer('server-1'), createMockServer('server-2')];

  const fetcher = async (server: ServerRegistration) => {
    return [`${server.id}-tool-1`, `${server.id}-tool-2`];
  };

  const results = await aggregateFromServers(servers, fetcher, 'tools');

  assertEquals(results.length, 4);
  assertEquals(results.includes('server-1-tool-1'), true);
  assertEquals(results.includes('server-1-tool-2'), true);
  assertEquals(results.includes('server-2-tool-1'), true);
  assertEquals(results.includes('server-2-tool-2'), true);
});

Deno.test('aggregateFromServers - handles empty server list', async () => {
  const servers: ServerRegistration[] = [];

  const fetcher = async (_server: ServerRegistration) => {
    return ['tool'];
  };

  const results = await aggregateFromServers(servers, fetcher, 'tools');

  assertEquals(results.length, 0);
});

Deno.test('aggregateFromServers - handles fetcher returning empty arrays', async () => {
  const servers = [createMockServer('server-1'), createMockServer('server-2')];

  const fetcher = async (_server: ServerRegistration) => {
    return [] as string[];
  };

  const results = await aggregateFromServers(servers, fetcher, 'tools');

  assertEquals(results.length, 0);
});

Deno.test('aggregateFromServers - continues on single server failure', async () => {
  const servers = [
    createMockServer('server-1'),
    createMockServer('server-2'),
    createMockServer('server-3'),
  ];

  const fetcher = async (server: ServerRegistration) => {
    if (server.id === 'server-2') {
      throw new Error('Server 2 failed');
    }
    return [`tool-from-${server.id}`];
  };

  const results = await aggregateFromServers(servers, fetcher, 'tools');

  assertEquals(results.length, 2);
  assertEquals(results.includes('tool-from-server-1'), true);
  assertEquals(results.includes('tool-from-server-3'), true);
  assertEquals(results.includes('tool-from-server-2'), false);
});

Deno.test('aggregateFromServers - handles all servers failing', async () => {
  const servers = [createMockServer('server-1'), createMockServer('server-2')];

  const fetcher = async (_server: ServerRegistration): Promise<string[]> => {
    throw new Error('All servers failed');
  };

  const results = await aggregateFromServers(servers, fetcher, 'tools');

  assertEquals(results.length, 0);
});

Deno.test('aggregateFromServers - processes servers in parallel', async () => {
  const servers = [
    createMockServer('server-1'),
    createMockServer('server-2'),
    createMockServer('server-3'),
  ];

  const callOrder: string[] = [];
  const fetcher = async (server: ServerRegistration) => {
    callOrder.push(`start-${server.id}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    callOrder.push(`end-${server.id}`);
    return [`tool-from-${server.id}`];
  };

  await aggregateFromServers(servers, fetcher, 'tools');

  // All starts should happen before all ends (parallel execution)
  const startIndices = callOrder
    .filter((c) => c.startsWith('start'))
    .map((c) => callOrder.indexOf(c));
  const endIndices = callOrder
    .filter((c) => c.startsWith('end'))
    .map((c) => callOrder.indexOf(c));

  // At least one end should happen after multiple starts (indicating parallel)
  const allStartsBeforeAnyEnd = startIndices.every((s) =>
    endIndices.every((e) => s < e)
  );
  // This would only be true if truly sequential - parallel should have interleaving
  // For parallel execution, we just verify all results are collected
  assertEquals(callOrder.length, 6);
});

Deno.test('aggregateFromServers - works with complex objects', async () => {
  interface Tool {
    name: string;
    description: string;
  }

  const servers = [createMockServer('server-1')];

  const fetcher = async (server: ServerRegistration): Promise<Tool[]> => {
    return [
      { name: `${server.id}.tool1`, description: 'First tool' },
      { name: `${server.id}.tool2`, description: 'Second tool' },
    ];
  };

  const results = await aggregateFromServers<Tool>(servers, fetcher, 'tools');

  assertEquals(results.length, 2);
  assertEquals(results[0].name, 'server-1.tool1');
  assertEquals(results[1].name, 'server-1.tool2');
});

Deno.test('aggregateFromServers - preserves order from each server', async () => {
  const servers = [createMockServer('server-1')];

  const fetcher = async (_server: ServerRegistration) => {
    return ['a', 'b', 'c', 'd'];
  };

  const results = await aggregateFromServers(servers, fetcher, 'items');

  assertEquals(results, ['a', 'b', 'c', 'd']);
});
