import type { Context } from '@netlify/edge-functions';
import { ServerRegistry } from './registry/ServerRegistry.ts';
import { BackendMcpClient } from './client/BackendMcpClient.ts';
import { ResponseCache } from './cache/ResponseCache.ts';
import { IntelligentRouter } from './routing/IntelligentRouter.ts';
import { McpProtocolHandler } from './protocol/McpProtocolHandler.ts';
import { loadConfig } from './config.ts';
import { HealthStatus } from './types/server.ts';

export interface Gateway {
  registry: ServerRegistry;
  client: BackendMcpClient;
  cache: ResponseCache;
  router: IntelligentRouter;
  protocolHandler: McpProtocolHandler;
}

let cachedGateway: Gateway | null = null;

/**
 * Initialize the gateway (called on each edge function invocation)
 * Reuses cached instance if available within the same edge node
 */
export async function initializeGateway(_context: Context): Promise<Gateway> {
  // Reuse if already initialized (within same edge container)
  if (cachedGateway) {
    return cachedGateway;
  }

  console.log('Initializing MCP Gateway...');

  const config = loadConfig();

  // Create core components
  const registry = ServerRegistry.getInstance();
  const client = new BackendMcpClient(config.routing);
  const cache = new ResponseCache(config.cache);
  const router = new IntelligentRouter(registry, client, cache);
  const protocolHandler = new McpProtocolHandler(registry, router, client);

  // Register servers
  for (const serverConfig of config.servers) {
    registry.register({
      ...serverConfig,
      capabilities: { tools: [], resources: [], prompts: [] }, // Will be lazy-loaded
      health: {
        status: HealthStatus.UNKNOWN,
        lastCheck: new Date(),
        latency: 0,
        consecutiveFailures: 0,
      },
      registeredAt: new Date(),
    });
  }

  // Perform initial health checks (async, don't wait)
  Promise.all(
    config.servers.map(async (serverConfig) => {
      try {
        const server = registry.getServer(serverConfig.id);
        if (server) {
          const health = await client.checkHealth(server);
          registry.updateHealth(serverConfig.id, health);
          console.log(`Health check for ${serverConfig.id}: ${health.status}`);
        }
      } catch (error) {
        console.error(`Health check failed for ${serverConfig.id}:`, error);
      }
    })
  ).catch((error) =>
    console.error('Health check initialization failed:', error)
  );

  cachedGateway = { registry, client, cache, router, protocolHandler };

  console.log(`Gateway initialized with ${config.servers.length} servers`);

  return cachedGateway;
}
