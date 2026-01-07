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

    // Health check endpoint
    if (path === '/health' && request.method === 'GET') {
      const servers = gateway.registry.listServers();
      const healthStatus = {
        status: 'UP',
        servers: servers.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.health.status,
          latency: s.health.latency,
        })),
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
