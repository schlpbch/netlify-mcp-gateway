import type { Context } from '@netlify/edge-functions';
import { initializeGateway } from '../../src/init.ts';

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    const gateway = await initializeGateway(context);

    // Route based on path and method
    if (path === '/mcp/tools/list' && request.method === 'GET') {
      const result = await gateway.protocolHandler.listTools();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/mcp/tools/call' && request.method === 'POST') {
      const body = await request.json();
      const result = await gateway.protocolHandler.callTool(body);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/mcp/resources/list' && request.method === 'GET') {
      const result = await gateway.protocolHandler.listResources();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/mcp/resources/read' && request.method === 'POST') {
      const body = await request.json();
      const result = await gateway.protocolHandler.readResource(body);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/mcp/prompts/list' && request.method === 'GET') {
      const result = await gateway.protocolHandler.listPrompts();
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/mcp/prompts/get' && request.method === 'POST') {
      const body = await request.json();
      const result = await gateway.protocolHandler.getPrompt(body);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Health check endpoint (supports both /mcp/health and /health)
    if ((path === '/mcp/health' || path === '/health') && request.method === 'GET') {
      const servers = gateway.registry.listServers();

      // Check health of each server in parallel
      const healthChecks = await Promise.allSettled(
        servers.map(async (server) => {
          const health = await gateway.client.checkHealth(server);
          return { server, health };
        })
      );

      const serverStatuses = healthChecks.map((result, index) => {
        if (result.status === 'fulfilled') {
          const { server, health } = result.value;
          return {
            id: server.id,
            name: server.name,
            endpoint: server.endpoint,
            status: health.status,
            latency: health.latency,
            lastCheck: health.lastCheck,
            errorMessage: health.errorMessage,
          };
        } else {
          const server = servers[index];
          return {
            id: server.id,
            name: server.name,
            endpoint: server.endpoint,
            status: 'DOWN',
            latency: 0,
            errorMessage: result.reason?.message || 'Health check failed',
          };
        }
      });

      const allHealthy = serverStatuses.every((s) => s.status === 'HEALTHY');
      const anyHealthy = serverStatuses.some((s) => s.status === 'HEALTHY');

      const healthStatus = {
        status: allHealthy ? 'UP' : anyHealthy ? 'DEGRADED' : 'DOWN',
        timestamp: new Date().toISOString(),
        servers: serverStatuses,
      };

      return new Response(JSON.stringify(healthStatus), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const config = { path: '/mcp/*' };
