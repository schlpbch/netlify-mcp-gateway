import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { ServerRegistry } from './ServerRegistry.ts';
import { HealthStatus, TransportType } from '../types/server.ts';
import type { ServerRegistration, ServerHealth, ServerCapabilities } from '../types/server.ts';

function createMockServer(
  id: string,
  healthStatus: HealthStatus = HealthStatus.HEALTHY
): ServerRegistration {
  return {
    id,
    name: `Test Server ${id}`,
    endpoint: `https://${id}.example.com/mcp`,
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

Deno.test('ServerRegistry - singleton instance', () => {
  const instance1 = ServerRegistry.getInstance();
  const instance2 = ServerRegistry.getInstance();
  assertEquals(instance1, instance2);
});

Deno.test('ServerRegistry - register and get server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const server = createMockServer('journey-service-mcp');
  registry.register(server);

  const retrieved = registry.getServer('journey-service-mcp');
  assertEquals(retrieved?.id, 'journey-service-mcp');
  assertEquals(retrieved?.name, 'Test Server journey-service-mcp');
});

Deno.test('ServerRegistry - unregister server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const server = createMockServer('test-server');
  registry.register(server);
  assertEquals(registry.getServer('test-server')?.id, 'test-server');

  registry.unregister('test-server');
  assertEquals(registry.getServer('test-server'), undefined);
});

Deno.test('ServerRegistry - listServers returns all servers', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('server-1'));
  registry.register(createMockServer('server-2'));
  registry.register(createMockServer('server-3'));

  const servers = registry.listServers();
  assertEquals(servers.length, 3);
});

Deno.test('ServerRegistry - listHealthyServers excludes only DOWN servers', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('healthy-1', HealthStatus.HEALTHY));
  registry.register(createMockServer('degraded-1', HealthStatus.DEGRADED));
  registry.register(createMockServer('down-1', HealthStatus.DOWN));
  registry.register(createMockServer('healthy-2', HealthStatus.HEALTHY));

  const availableServers = registry.listHealthyServers();
  // Should include HEALTHY and DEGRADED, exclude only DOWN
  assertEquals(availableServers.length, 3);
  assertEquals(availableServers.every((s) => s.health.status !== HealthStatus.DOWN), true);
});

Deno.test('ServerRegistry - resolveToolServer finds correct server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('journey-service-mcp'));
  registry.register(createMockServer('swiss-mobility-mcp'));

  const server = registry.resolveToolServer('journey.findTrips');
  assertEquals(server.id, 'journey-service-mcp');
});

Deno.test('ServerRegistry - resolveToolServer throws for unknown server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  assertThrows(
    () => registry.resolveToolServer('unknown.someTool'),
    Error,
    'Server not found for tool'
  );
});

Deno.test('ServerRegistry - resolveResourceServer finds correct server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('journey-service-mcp'));

  // The extractServerId function uses dot notation, so URI-style resources
  // need to use dot notation for namespacing (e.g., "journey.routes/123")
  const server = registry.resolveResourceServer('journey.routes/123');
  assertEquals(server.id, 'journey-service-mcp');
});

Deno.test('ServerRegistry - resolvePromptServer finds correct server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('journey-service-mcp'));

  const server = registry.resolvePromptServer('journey.tripPlanner');
  assertEquals(server.id, 'journey-service-mcp');
});

Deno.test('ServerRegistry - updateHealth updates server health', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('test-server', HealthStatus.HEALTHY));

  const newHealth: ServerHealth = {
    status: HealthStatus.DOWN,
    lastCheck: new Date(),
    latency: 5000,
    consecutiveFailures: 3,
    errorMessage: 'Connection timeout',
  };

  registry.updateHealth('test-server', newHealth);

  const server = registry.getServer('test-server');
  assertEquals(server?.health.status, HealthStatus.DOWN);
  assertEquals(server?.health.consecutiveFailures, 3);
  assertEquals(server?.health.errorMessage, 'Connection timeout');
});

Deno.test('ServerRegistry - updateCapabilities updates server capabilities', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('test-server'));

  const newCapabilities: ServerCapabilities = {
    tools: ['newTool1', 'newTool2', 'newTool3'],
    resources: [{ uriPrefix: 'test://', description: 'Test resources' }],
    prompts: ['prompt1'],
  };

  registry.updateCapabilities('test-server', newCapabilities);

  const server = registry.getServer('test-server');
  assertEquals(server?.capabilities.tools.length, 3);
  assertEquals(server?.capabilities.resources.length, 1);
  assertEquals(server?.capabilities.prompts.length, 1);
});

Deno.test('ServerRegistry - clear removes all servers', () => {
  const registry = ServerRegistry.getInstance();

  registry.register(createMockServer('server-1'));
  registry.register(createMockServer('server-2'));

  registry.clear();

  assertEquals(registry.listServers().length, 0);
});

// ================== ADDITIONAL TESTS FOR DEGRADED STATUS ==================

Deno.test('ServerRegistry - listHealthyServers includes UNKNOWN status', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('healthy-1', HealthStatus.HEALTHY));
  registry.register(createMockServer('unknown-1', HealthStatus.UNKNOWN));
  registry.register(createMockServer('down-1', HealthStatus.DOWN));

  const availableServers = registry.listHealthyServers();

  assertEquals(availableServers.length, 2);
  assertEquals(
    availableServers.some((s) => s.health.status === HealthStatus.UNKNOWN),
    true
  );
});

Deno.test('ServerRegistry - DEGRADED servers are included in listHealthyServers', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  // Add only DEGRADED server
  registry.register(createMockServer('degraded-only', HealthStatus.DEGRADED));

  const availableServers = registry.listHealthyServers();

  assertEquals(availableServers.length, 1);
  assertEquals(availableServers[0].id, 'degraded-only');
});

Deno.test('ServerRegistry - listHealthyServers returns empty when all DOWN', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('down-1', HealthStatus.DOWN));
  registry.register(createMockServer('down-2', HealthStatus.DOWN));
  registry.register(createMockServer('down-3', HealthStatus.DOWN));

  const availableServers = registry.listHealthyServers();

  assertEquals(availableServers.length, 0);
});

// ================== EDGE CASE TESTS ==================

Deno.test('ServerRegistry - getServer returns undefined for non-existent server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const server = registry.getServer('non-existent-server');

  assertEquals(server, undefined);
});

Deno.test('ServerRegistry - updateHealth does nothing for non-existent server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const newHealth: ServerHealth = {
    status: HealthStatus.DOWN,
    lastCheck: new Date(),
    latency: 1000,
    consecutiveFailures: 5,
  };

  // Should not throw
  registry.updateHealth('non-existent-server', newHealth);

  assertEquals(registry.getServer('non-existent-server'), undefined);
});

Deno.test('ServerRegistry - updateCapabilities does nothing for non-existent server', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const newCapabilities: ServerCapabilities = {
    tools: ['tool1'],
    resources: [],
    prompts: [],
  };

  // Should not throw
  registry.updateCapabilities('non-existent-server', newCapabilities);

  assertEquals(registry.getServer('non-existent-server'), undefined);
});

Deno.test('ServerRegistry - re-registering server replaces existing', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const server1 = createMockServer('test-server');
  server1.name = 'Original Name';
  registry.register(server1);

  const server2 = createMockServer('test-server');
  server2.name = 'Updated Name';
  registry.register(server2);

  const retrieved = registry.getServer('test-server');

  assertEquals(retrieved?.name, 'Updated Name');
  assertEquals(registry.listServers().length, 1);
});

Deno.test('ServerRegistry - unregister non-existent server does not throw', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  // Should not throw
  registry.unregister('non-existent-server');

  assertEquals(registry.listServers().length, 0);
});

// ================== RESOLVER EDGE CASES ==================

Deno.test('ServerRegistry - resolveResourceServer throws for unknown URI', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('journey-service-mcp'));

  assertThrows(
    () => registry.resolveResourceServer('unknown.resource/123'),
    Error,
    'Server not found for resource'
  );
});

Deno.test('ServerRegistry - resolvePromptServer throws for unknown prompt', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('journey-service-mcp'));

  assertThrows(
    () => registry.resolvePromptServer('unknown.promptName'),
    Error,
    'Server not found for prompt'
  );
});

Deno.test('ServerRegistry - resolveToolServer works with mobility namespace', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('swiss-mobility-mcp'));

  const server = registry.resolveToolServer('mobility.getStations');

  assertEquals(server.id, 'swiss-mobility-mcp');
});

Deno.test('ServerRegistry - resolveToolServer works with aareguru namespace', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('aareguru-mcp'));

  const server = registry.resolveToolServer('aareguru.get_current_temperature');

  assertEquals(server.id, 'aareguru-mcp');
});

Deno.test('ServerRegistry - resolveToolServer works with meteo namespace', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('open-meteo-mcp'));

  const server = registry.resolveToolServer('meteo.getForecast');

  assertEquals(server.id, 'open-meteo-mcp');
});

Deno.test('ServerRegistry - resolveToolServer works with weather alias', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('open-meteo-mcp'));

  const server = registry.resolveToolServer('weather.getTemperature');

  assertEquals(server.id, 'open-meteo-mcp');
});

// ================== HEALTH UPDATE TESTS ==================

Deno.test('ServerRegistry - updateHealth preserves other server properties', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const server = createMockServer('test-server');
  server.name = 'Test Server';
  server.endpoint = 'https://test.example.com/mcp';
  server.priority = 5;
  registry.register(server);

  const newHealth: ServerHealth = {
    status: HealthStatus.DEGRADED,
    lastCheck: new Date(),
    latency: 500,
    consecutiveFailures: 2,
    errorMessage: 'Timeout',
  };

  registry.updateHealth('test-server', newHealth);

  const updated = registry.getServer('test-server');

  assertEquals(updated?.name, 'Test Server');
  assertEquals(updated?.endpoint, 'https://test.example.com/mcp');
  assertEquals(updated?.priority, 5);
  assertEquals(updated?.health.status, HealthStatus.DEGRADED);
  assertEquals(updated?.health.errorMessage, 'Timeout');
});

Deno.test('ServerRegistry - updateCapabilities preserves other server properties', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  const server = createMockServer('test-server');
  server.name = 'Test Server';
  server.health.status = HealthStatus.HEALTHY;
  registry.register(server);

  const newCapabilities: ServerCapabilities = {
    tools: ['newTool1', 'newTool2'],
    resources: [{ uriPrefix: 'test://', description: 'Test' }],
    prompts: ['prompt1', 'prompt2'],
  };

  registry.updateCapabilities('test-server', newCapabilities);

  const updated = registry.getServer('test-server');

  assertEquals(updated?.name, 'Test Server');
  assertEquals(updated?.health.status, HealthStatus.HEALTHY);
  assertEquals(updated?.capabilities.tools.length, 2);
  assertEquals(updated?.capabilities.prompts.length, 2);
});

// ================== ORDERING TESTS ==================

Deno.test('ServerRegistry - listServers returns servers in insertion order', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('server-a'));
  registry.register(createMockServer('server-b'));
  registry.register(createMockServer('server-c'));

  const servers = registry.listServers();

  assertEquals(servers[0].id, 'server-a');
  assertEquals(servers[1].id, 'server-b');
  assertEquals(servers[2].id, 'server-c');
});

Deno.test('ServerRegistry - listHealthyServers maintains order', () => {
  const registry = ServerRegistry.getInstance();
  registry.clear();

  registry.register(createMockServer('healthy-a', HealthStatus.HEALTHY));
  registry.register(createMockServer('down-b', HealthStatus.DOWN));
  registry.register(createMockServer('healthy-c', HealthStatus.HEALTHY));

  const servers = registry.listHealthyServers();

  assertEquals(servers.length, 2);
  assertEquals(servers[0].id, 'healthy-a');
  assertEquals(servers[1].id, 'healthy-c');
});
