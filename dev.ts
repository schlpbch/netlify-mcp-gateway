#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

/**
 * Local development server for MCP Gateway
 * Mimics deno Edge Functions locally using native Deno HTTP server
 */

import type { Gateway } from './src/init.ts';
import { ServerRegistry } from './src/registry/ServerRegistry.ts';
import { BackendMcpClient } from './src/client/BackendMcpClient.ts';
import { ResponseCache } from './src/cache/ResponseCache.ts';
import { IntelligentRouter } from './src/routing/IntelligentRouter.ts';
import { McpProtocolHandler } from './src/protocol/McpProtocolHandler.ts';
import { HealthMonitor } from './src/monitoring/HealthMonitor.ts';
import { loadConfig } from './src/config.ts';
import { HealthStatus } from './src/types/server.ts';

const PORT = parseInt(Deno.env.get('PORT') || '8888');

// Initialize gateway (for local dev)
async function initGateway(): Promise<Gateway> {
  console.log('Initializing MCP Gateway for local development...');

  const config = loadConfig();

  // Create core components
  const registry = ServerRegistry.getInstance();
  const client = new BackendMcpClient(config.routing);
  const cache = new ResponseCache(config.cache);
  const router = new IntelligentRouter(registry, client, cache);
  const protocolHandler = new McpProtocolHandler(registry, router, client);

  protocolHandler.setCache(cache);

  const healthMonitor = new HealthMonitor(registry, client, config.health);

  // Register servers
  for (const serverConfig of config.servers) {
    registry.register({
      id: serverConfig.id,
      name: serverConfig.name,
      endpoint: serverConfig.endpoint,
      health: {
        status: HealthStatus.UNKNOWN,
        lastCheck: new Date(),
        latency: 0,
      },
    });
  }

  // Start health monitoring
  healthMonitor.start();

  const gateway: Gateway = {
    registry,
    client,
    cache,
    router,
    protocolHandler,
    healthMonitor,
  };

  console.log(`✅ Gateway initialized with ${config.servers.length} servers`);
  return gateway;
}

// Initialize gateway
const gateway = await initGateway();

// Import the edge function handler
const mcpHandler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // Health check endpoint
  if (url.pathname === '/health') {
    return new Response(
      JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        gateway: 'mcp-gateway',
        version: '0.2.0',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Metrics endpoint for dashboard
  if (url.pathname === '/metrics') {
    const metrics = {
      totalRequests: gateway.healthMonitor ? gateway.healthMonitor.totalRequests || 0 : 0,
      totalErrors: gateway.healthMonitor ? gateway.healthMonitor.totalErrors || 0 : 0,
      errorRate: gateway.healthMonitor ? (gateway.healthMonitor.totalErrors || 0) / Math.max((gateway.healthMonitor.totalRequests || 1), 1) : 0,
      cacheHitRate: gateway.cache ? gateway.cache.getHitRate() : 0,
      averageLatency: gateway.healthMonitor ? gateway.healthMonitor.averageLatency || 0 : 0,
      backends: Array.from(gateway.registry.getServers()).map(server => ({
        id: server.id,
        name: server.name,
        status: server.health?.status || 'UNKNOWN',
        latency: server.health?.latency || 0,
      })),
      timestamp: new Date().toISOString(),
    };
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Static files from public/
  if (url.pathname === '/' || url.pathname === '/dashboard' || url.pathname.startsWith('/public/')) {
    try {
      const filePath =
        url.pathname === '/' ? './public/index.html' 
        : url.pathname === '/dashboard' ? './public/dashboard.html'
        : '.' + url.pathname;

      const file = await Deno.readFile(filePath);
      const contentType = filePath.endsWith('.html')
        ? 'text/html'
        : filePath.endsWith('.css')
        ? 'text/css'
        : filePath.endsWith('.js')
        ? 'application/javascript'
        : 'application/octet-stream';

      return new Response(file, {
        status: 200,
        headers: { 'Content-Type': contentType },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  }

  // MCP endpoints
  if (url.pathname.startsWith('/mcp/')) {
    // Load and execute the edge function
    const { default: handler } = await import('./deno/edge-functions/mcp.ts');
    return handler(request, { gateway });
  }

  return new Response('Not Found', { status: 404 });
};

// Start HTTP server
console.log(`🦕 Deno MCP Gateway`);
console.log(`📡 Server starting on http://localhost:${PORT}`);
console.log(`🌐 MCP endpoints: http://localhost:${PORT}/mcp/*`);
console.log(`❤️  Health check: http://localhost:${PORT}/health`);
console.log(`📄 Web UI: http://localhost:${PORT}/\n`);

Deno.serve({ port: PORT }, mcpHandler);
