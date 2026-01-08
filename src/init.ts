import type { Context } from '@netlify/edge-functions';
import { ServerRegistry } from './registry/ServerRegistry.ts';
import { BackendMcpClient } from './client/BackendMcpClient.ts';
import { ResponseCache } from './cache/ResponseCache.ts';
import { IntelligentRouter } from './routing/IntelligentRouter.ts';
import { McpProtocolHandler } from './protocol/McpProtocolHandler.ts';
import { HealthMonitor } from './monitoring/HealthMonitor.ts';
import { loadConfig } from './config.ts';
import { HealthStatus } from './types/server.ts';

export interface Gateway {
  registry: ServerRegistry;
  client: BackendMcpClient;
  cache: ResponseCache;
  router: IntelligentRouter;
  protocolHandler: McpProtocolHandler;
  healthMonitor: HealthMonitor;
}

let cachedGateway: Gateway | null = null;

/**
 * Initialize the gateway (called on each edge function invocation)
 * Reuses cached instance if available within the same edge node
 */
export function initializeGateway(_context: Context): Promise<Gateway> {
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

  // Wire up cache for list response caching
  protocolHandler.setCache(cache);

  // Create health monitor
  const healthMonitor = new HealthMonitor(registry, client, config.health);

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

  // Start periodic health monitoring
  // Note: In edge functions, this runs for the lifetime of the container
  healthMonitor.start();

  cachedGateway = { registry, client, cache, router, protocolHandler, healthMonitor };

  console.log(`Gateway initialized with ${config.servers.length} servers`);

  return cachedGateway;
}
