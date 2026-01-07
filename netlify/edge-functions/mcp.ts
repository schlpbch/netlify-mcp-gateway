import type { Context } from '@netlify/edge-functions';
import { initializeGateway } from '../../src/init.ts';

// Router helper for cleaner routing
type Handler = (c: RouteContext) => Promise<Response>;
interface RouteContext {
  request: Request;
  context: Context;
  gateway: any;
  json: (data: any, status?: number) => Response;
  text: (text: string, status?: number) => Response;
}

const createRouteContext = (request: Request, context: Context, gateway: any): RouteContext => ({
  request,
  context,
  gateway,
  json: (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  text: (text: string, status = 200) => new Response(text, { status }),
});

// Route definitions
const routes: Array<{
  method: string;
  path: RegExp;
  handler: Handler;
}> = [
  {
    method: 'GET',
    path: /^\/mcp\/tools\/list$/,
    handler: async (c) => {
      const result = await c.gateway.protocolHandler.listTools();
      return c.json(result);
    },
  },
  {
    method: 'POST',
    path: /^\/mcp\/tools\/call$/,
    handler: async (c) => {
      const body = await c.request.json();
      const result = await c.gateway.protocolHandler.callTool(body);
      return c.json(result);
    },
  },
  {
    method: 'GET',
    path: /^\/mcp\/resources\/list$/,
    handler: async (c) => {
      const result = await c.gateway.protocolHandler.listResources();
      return c.json(result);
    },
  },
  {
    method: 'POST',
    path: /^\/mcp\/resources\/read$/,
    handler: async (c) => {
      const body = await c.request.json();
      const result = await c.gateway.protocolHandler.readResource(body);
      return c.json(result);
    },
  },
  {
    method: 'GET',
    path: /^\/mcp\/prompts\/list$/,
    handler: async (c) => {
      const result = await c.gateway.protocolHandler.listPrompts();
      return c.json(result);
    },
  },
  {
    method: 'POST',
    path: /^\/mcp\/prompts\/get$/,
    handler: async (c) => {
      const body = await c.request.json();
      const result = await c.gateway.protocolHandler.getPrompt(body);
      return c.json(result);
    },
  },
  {
    method: 'GET',
    path: /^\/mcp\/health$|^\/health$/,
    handler: async (c) => {
      const servers = c.gateway.registry.listServers();
      const healthChecks = await Promise.allSettled(
        servers.map(async (server: any) => {
          const health = await c.gateway.client.checkHealth(server);
          return { server, health };
        })
      );

      const serverStatuses = healthChecks.map((result: any, index: number) => {
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

      const allHealthy = serverStatuses.every((s: any) => s.status === 'HEALTHY');
      const anyHealthy = serverStatuses.some((s: any) => s.status === 'HEALTHY');

      return c.json({
        status: allHealthy ? 'UP' : anyHealthy ? 'DEGRADED' : 'DOWN',
        timestamp: new Date().toISOString(),
        servers: serverStatuses,
      });
    },
  },
];

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    const gateway = await initializeGateway(context);
    const routeContext = createRouteContext(request, context, gateway);

    // Find matching route
    for (const route of routes) {
      if (route.method === method && route.path.test(path)) {
        return await route.handler(routeContext);
      }
    }

    return routeContext.text('Not Found', 404);
  } catch (error) {
    console.error('Edge function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const config = { path: '/mcp/*' };
