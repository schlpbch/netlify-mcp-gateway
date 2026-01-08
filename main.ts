/**
 * MCP Gateway Server for Deno Deploy
 *
 * A stateful MCP gateway that aggregates multiple backend MCP servers
 * and exposes them via SSE transport for claude.ai integration.
 *
 * Run locally: deno run --allow-net --allow-env main.ts
 * Deploy: deployctl deploy --project=mcp-gateway --prod main.ts
 */

// =============================================================================
// Configuration
// =============================================================================

interface BackendServer {
  id: string;
  name: string;
  endpoint: string;
  requiresSession: boolean;
}

const BACKEND_SERVERS: BackendServer[] = [
  {
    id: 'journey',
    name: 'Journey Service',
    endpoint: Deno.env.get('JOURNEY_SERVICE_URL') ||
      'https://journey-service-mcp-staging-874479064416.europe-west6.run.app',
    requiresSession: true,
  },
  {
    id: 'aareguru',
    name: 'Aareguru',
    endpoint: Deno.env.get('AAREGURU_URL') || 'https://aareguru.fastmcp.app/mcp',
    requiresSession: false,
  },
];

// Backend session storage (for servers that require Mcp-Session-Id)
const backendSessions = new Map<string, string>();

const SERVER_INFO = {
  name: 'mcp-gateway',
  version: '2.0.0',
  protocolVersion: '2024-11-05',
};

// =============================================================================
// Session Management
// =============================================================================

interface Session {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
  createdAt: number;
}

const sessions = new Map<string, Session>();

// Metrics
const metrics = {
  startTime: Date.now(),
  totalRequests: 0,
  totalErrors: 0,
  toolCalls: 0,
  sessionsCreated: 0,
};

// =============================================================================
// JSON-RPC Helpers
// =============================================================================

const jsonRpcResponse = (id: string | number | null, result: unknown) => ({
  jsonrpc: '2.0' as const,
  id,
  result,
});

const jsonRpcError = (id: string | number | null, code: number, message: string) => ({
  jsonrpc: '2.0' as const,
  id,
  error: { code, message },
});

// =============================================================================
// Backend Communication
// =============================================================================

let requestIdCounter = 1;

/**
 * Initialize a session with a backend server that requires Mcp-Session-Id
 */
async function initializeBackendSession(
  server: BackendServer,
  timeoutMs = 10000
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(server.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-gateway', version: '2.0.0' },
        },
        id: requestIdCounter++,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Failed to initialize session with ${server.id}: ${response.status}`);
      return null;
    }

    // Get session ID from response header
    const sessionId = response.headers.get('Mcp-Session-Id');
    if (sessionId) {
      console.log(`Initialized session with ${server.id}: ${sessionId}`);
      backendSessions.set(server.id, sessionId);
      return sessionId;
    }

    // Some servers return session in body
    const text = await response.text();
    const jsonRpc = JSON.parse(text);
    if (jsonRpc.result) {
      // Session initialized successfully even without header
      // Generate a placeholder session ID
      const placeholderSessionId = `${server.id}-${Date.now()}`;
      backendSessions.set(server.id, placeholderSessionId);
      return placeholderSessionId;
    }

    return null;
  } catch (e) {
    console.error(`Error initializing session with ${server.id}:`, e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get or create a session for a backend server
 */
async function getBackendSession(server: BackendServer): Promise<string | null> {
  if (!server.requiresSession) {
    return null;
  }

  const existingSession = backendSessions.get(server.id);
  if (existingSession) {
    return existingSession;
  }

  const newSession = await initializeBackendSession(server);
  return newSession;
}

/**
 * Send JSON-RPC request to a backend server
 */
async function sendJsonRpcRequest(
  endpoint: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 30000,
  sessionId?: string | null
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: requestIdCounter++,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const text = await response.text();

    // Parse SSE or plain JSON response
    if (text.startsWith('event:') || text.startsWith('data:')) {
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonRpc = JSON.parse(line.substring(6));
          if (jsonRpc.error) throw new Error(jsonRpc.error.message);
          return jsonRpc.result;
        }
      }
      throw new Error('No data in SSE response');
    }

    const jsonRpc = JSON.parse(text);
    if (jsonRpc.error) throw new Error(jsonRpc.error.message);
    return jsonRpc.result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send JSON-RPC request to a specific backend server (with session handling)
 */
async function sendToBackend(
  server: BackendServer,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 30000
): Promise<unknown> {
  const sessionId = await getBackendSession(server);
  return sendJsonRpcRequest(server.endpoint, method, params, timeoutMs, sessionId);
}

// =============================================================================
// Backend Health Checks
// =============================================================================

interface BackendHealth {
  id: string;
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  error?: string;
}

async function checkBackendHealth(server: BackendServer): Promise<BackendHealth> {
  const start = Date.now();
  try {
    await sendToBackend(server, 'ping', {}, 5000);
    return {
      id: server.id,
      name: server.name,
      status: 'healthy',
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      id: server.id,
      name: server.name,
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Tool/Resource/Prompt Aggregation
// =============================================================================

async function fetchToolsFromServer(server: BackendServer): Promise<unknown[]> {
  try {
    const result = await sendToBackend(server, 'tools/list') as { tools?: unknown[] };
    return (result.tools || []).map((tool: unknown) => ({
      ...(tool as Record<string, unknown>),
      // Use double underscore as namespace separator (dots not allowed in MCP tool names)
      name: `${server.id}__${(tool as Record<string, unknown>).name}`,
    }));
  } catch (e) {
    console.error(`Failed to fetch tools from ${server.name}:`, e);
    return [];
  }
}

async function fetchResourcesFromServer(server: BackendServer): Promise<unknown[]> {
  try {
    const result = await sendToBackend(server, 'resources/list') as { resources?: unknown[] };
    return (result.resources || []).map((resource: unknown) => {
      const r = resource as Record<string, unknown>;
      return {
        ...r,
        uri: `${server.id}://${r.uri}`,
      };
    });
  } catch (e) {
    console.error(`Failed to fetch resources from ${server.name}:`, e);
    return [];
  }
}

async function fetchPromptsFromServer(server: BackendServer): Promise<unknown[]> {
  try {
    const result = await sendToBackend(server, 'prompts/list') as { prompts?: unknown[] };
    return (result.prompts || []).map((prompt: unknown) => ({
      ...(prompt as Record<string, unknown>),
      // Use double underscore as namespace separator (dots not allowed in MCP prompt names)
      name: `${server.id}__${(prompt as Record<string, unknown>).name}`,
    }));
  } catch (e) {
    console.error(`Failed to fetch prompts from ${server.name}:`, e);
    return [];
  }
}

async function callToolOnServer(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  // Split on double underscore (namespace separator)
  const separatorIndex = toolName.indexOf('__');
  if (separatorIndex === -1) {
    throw new Error(`Invalid tool name format: ${toolName}`);
  }
  const serverId = toolName.substring(0, separatorIndex);
  const actualToolName = toolName.substring(separatorIndex + 2);

  const server = BACKEND_SERVERS.find((s) => s.id === serverId);
  if (!server) {
    throw new Error(`Unknown server: ${serverId}`);
  }

  metrics.toolCalls++;
  return await sendToBackend(server, 'tools/call', {
    name: actualToolName,
    arguments: args,
  });
}

async function readResourceFromServer(uri: string): Promise<unknown> {
  // Parse URI format: serverId://originalUri
  const match = uri.match(/^([^:]+):\/\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const [, serverId, originalUri] = match;
  const server = BACKEND_SERVERS.find((s) => s.id === serverId);
  if (!server) {
    throw new Error(`Unknown server: ${serverId}`);
  }

  return await sendToBackend(server, 'resources/read', { uri: originalUri });
}

async function getPromptFromServer(promptName: string, args?: Record<string, unknown>): Promise<unknown> {
  // Split on double underscore (namespace separator)
  const separatorIndex = promptName.indexOf('__');
  if (separatorIndex === -1) {
    throw new Error(`Invalid prompt name format: ${promptName}`);
  }
  const serverId = promptName.substring(0, separatorIndex);
  const actualPromptName = promptName.substring(separatorIndex + 2);

  const server = BACKEND_SERVERS.find((s) => s.id === serverId);
  if (!server) {
    throw new Error(`Unknown server: ${serverId}`);
  }

  return await sendToBackend(server, 'prompts/get', {
    name: actualPromptName,
    arguments: args,
  });
}

// =============================================================================
// MCP Request Handler
// =============================================================================

async function handleJsonRpcRequest(
  method: string,
  params: Record<string, unknown> | undefined
): Promise<unknown> {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: SERVER_INFO.protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
        },
      };

    case 'notifications/initialized':
      return undefined;

    case 'tools/list': {
      const toolsArrays = await Promise.all(
        BACKEND_SERVERS.map((server) => fetchToolsFromServer(server))
      );
      return { tools: toolsArrays.flat() };
    }

    case 'tools/call': {
      const name = params?.name as string;
      const args = (params?.arguments || {}) as Record<string, unknown>;
      return await callToolOnServer(name, args);
    }

    case 'resources/list': {
      const resourcesArrays = await Promise.all(
        BACKEND_SERVERS.map((server) => fetchResourcesFromServer(server))
      );
      return { resources: resourcesArrays.flat() };
    }

    case 'resources/read': {
      const uri = params?.uri as string;
      return await readResourceFromServer(uri);
    }

    case 'prompts/list': {
      const promptsArrays = await Promise.all(
        BACKEND_SERVERS.map((server) => fetchPromptsFromServer(server))
      );
      return { prompts: promptsArrays.flat() };
    }

    case 'prompts/get': {
      const name = params?.name as string;
      const args = params?.arguments as Record<string, unknown> | undefined;
      return await getPromptFromServer(name, args);
    }

    case 'ping':
      return {};

    default:
      throw new Error(`Method not found: ${method}`);
  }
}

// =============================================================================
// SSE Helpers
// =============================================================================

function sendSSE(sessionId: string, event: string, data: unknown): boolean {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      session.controller.enqueue(session.encoder.encode(message));
      return true;
    } catch {
      sessions.delete(sessionId);
      return false;
    }
  }
  return false;
}

// =============================================================================
// HTTP Request Handler
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id',
};

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  metrics.totalRequests++;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Serve static files from public/
    if (path === '/' || path === '/index.html') {
      try {
        const content = await Deno.readTextFile('./public/index.html');
        return new Response(content, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
        });
      } catch {
        // Fall through to health check if file not found
      }
    }

    if (path === '/app.js') {
      try {
        const content = await Deno.readTextFile('./public/app.js');
        return new Response(content, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8', ...corsHeaders },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }

    if (path === '/styles.css') {
      try {
        const content = await Deno.readTextFile('./public/styles.css');
        return new Response(content, {
          headers: { 'Content-Type': 'text/css; charset=utf-8', ...corsHeaders },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }

    // Health check endpoint
    if (path === '/health') {
      const backendHealth = await Promise.all(
        BACKEND_SERVERS.map((server) => checkBackendHealth(server))
      );
      const allHealthy = backendHealth.every((b) => b.status === 'healthy');
      const anyHealthy = backendHealth.some((b) => b.status === 'healthy');

      return new Response(
        JSON.stringify({
          status: allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'unhealthy',
          server: SERVER_INFO,
          activeSessions: sessions.size,
          backends: backendHealth,
        }),
        {
          status: allHealthy ? 200 : anyHealthy ? 200 : 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // Metrics endpoint
    if (path === '/metrics') {
      const uptimeMs = Date.now() - metrics.startTime;
      return new Response(
        JSON.stringify({
          uptime: `${Math.floor(uptimeMs / 1000)}s`,
          totalRequests: metrics.totalRequests,
          totalErrors: metrics.totalErrors,
          toolCalls: metrics.toolCalls,
          sessionsCreated: metrics.sessionsCreated,
          activeSessions: sessions.size,
          errorRate:
            metrics.totalRequests > 0
              ? `${((metrics.totalErrors / metrics.totalRequests) * 100).toFixed(2)}%`
              : '0%',
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // SSE endpoint - GET /sse
    if (path === '/sse' && req.method === 'GET') {
      const sessionId = crypto.randomUUID();
      const messageEndpoint = `${url.protocol}//${url.host}/message?sessionId=${sessionId}`;
      const encoder = new TextEncoder();

      metrics.sessionsCreated++;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sessions.set(sessionId, {
            controller,
            encoder,
            createdAt: Date.now(),
          });

          // Send endpoint event
          const endpointEvent = `event: endpoint\ndata: "${messageEndpoint}"\n\n`;
          controller.enqueue(encoder.encode(endpointEvent));

          // Keep-alive ping every 25 seconds
          const pingInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': ping\n\n'));
            } catch {
              clearInterval(pingInterval);
              sessions.delete(sessionId);
            }
          }, 25000);

          // Clean up on abort
          req.signal.addEventListener('abort', () => {
            clearInterval(pingInterval);
            sessions.delete(sessionId);
            try {
              controller.close();
            } catch {
              // Already closed
            }
          });
        },
        cancel() {
          sessions.delete(sessionId);
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          ...corsHeaders,
        },
      });
    }

    // Message endpoint - POST /message
    if (path === '/message' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');

      if (!sessionId) {
        return new Response(
          JSON.stringify(jsonRpcError(null, -32600, 'Missing sessionId')),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      const session = sessions.get(sessionId);
      if (!session) {
        return new Response(
          JSON.stringify(jsonRpcError(null, -32600, 'Invalid or expired session')),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      const body = await req.json();
      const { id, method, params } = body;

      try {
        const result = await handleJsonRpcRequest(method, params);

        // For notifications (no id), just acknowledge
        if (id === undefined || id === null) {
          return new Response(null, { status: 202, headers: corsHeaders });
        }

        // Send response via SSE stream
        const response = jsonRpcResponse(id, result);
        sendSSE(sessionId, 'message', response);

        return new Response(null, { status: 202, headers: corsHeaders });
      } catch (error) {
        metrics.totalErrors++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (id !== undefined && id !== null) {
          sendSSE(sessionId, 'message', jsonRpcError(id, -32603, errorMessage));
        }

        return new Response(null, { status: 202, headers: corsHeaders });
      }
    }

    // ==========================================================================
    // Streamable HTTP Transport - POST /mcp
    // ==========================================================================
    // This implements the MCP Streamable HTTP transport specification.
    // Clients POST JSON-RPC requests and receive responses via SSE stream.
    // Session management is handled via Mcp-Session-Id header.
    if ((path === '/mcp' || path === '/mcp/') && req.method === 'POST') {
      const acceptHeader = req.headers.get('Accept') || '';
      const wantsSSE = acceptHeader.includes('text/event-stream');
      const contentType = req.headers.get('Content-Type') || '';

      if (!contentType.includes('application/json')) {
        return new Response(
          JSON.stringify(jsonRpcError(null, -32600, 'Content-Type must be application/json')),
          {
            status: 415,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      // Get or create session from header
      let sessionId = req.headers.get('Mcp-Session-Id');
      const isNewSession = !sessionId;

      if (isNewSession) {
        sessionId = crypto.randomUUID();
        metrics.sessionsCreated++;
      }

      const body = await req.json();

      // Handle batch requests (array of JSON-RPC messages)
      const requests = Array.isArray(body) ? body : [body];
      const responses: unknown[] = [];

      for (const request of requests) {
        const { id, method, params } = request;

        try {
          const result = await handleJsonRpcRequest(method, params);

          // Only add response if it's not a notification (has id)
          if (id !== undefined && id !== null) {
            responses.push(jsonRpcResponse(id, result));
          }
        } catch (error) {
          metrics.totalErrors++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          if (id !== undefined && id !== null) {
            responses.push(jsonRpcError(id, -32603, errorMessage));
          }
        }
      }

      // Build response headers
      const responseHeaders: Record<string, string> = {
        'Content-Type': wantsSSE ? 'text/event-stream' : 'application/json',
        'Cache-Control': 'no-cache',
        ...corsHeaders,
      };

      // Include session ID in response header for new sessions
      if (isNewSession && sessionId) {
        responseHeaders['Mcp-Session-Id'] = sessionId;
      }

      // If client wants SSE, stream the responses
      if (wantsSSE) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            // Send each response as an SSE event
            for (const response of responses) {
              const event = `event: message\ndata: ${JSON.stringify(response)}\n\n`;
              controller.enqueue(encoder.encode(event));
            }
            controller.close();
          },
        });

        return new Response(stream, { headers: responseHeaders });
      }

      // Return JSON response (single or batch)
      const responseBody = Array.isArray(body)
        ? responses
        : responses[0] || { jsonrpc: '2.0', result: null };

      return new Response(JSON.stringify(responseBody), {
        headers: responseHeaders,
      });
    }

    // Handle GET /mcp for SSE stream (optional long-lived connection)
    if ((path === '/mcp' || path === '/mcp/') && req.method === 'GET') {
      const sessionId = req.headers.get('Mcp-Session-Id');

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: 'Mcp-Session-Id header required for GET /mcp' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      const encoder = new TextEncoder();

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Store the session for server-initiated messages
          sessions.set(sessionId, {
            controller,
            encoder,
            createdAt: Date.now(),
          });

          // Keep-alive ping every 25 seconds
          const pingInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': ping\n\n'));
            } catch {
              clearInterval(pingInterval);
              sessions.delete(sessionId);
            }
          }, 25000);

          // Clean up on abort
          req.signal.addEventListener('abort', () => {
            clearInterval(pingInterval);
            sessions.delete(sessionId);
            try {
              controller.close();
            } catch {
              // Already closed
            }
          });
        },
        cancel() {
          sessions.delete(sessionId);
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Mcp-Session-Id': sessionId,
          ...corsHeaders,
        },
      });
    }

    // Handle DELETE /mcp to close session
    if ((path === '/mcp' || path === '/mcp/') && req.method === 'DELETE') {
      const sessionId = req.headers.get('Mcp-Session-Id');

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        if (session) {
          try {
            session.controller.close();
          } catch {
            // Already closed
          }
        }
        sessions.delete(sessionId);
      }

      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // MCP REST endpoints (for web UI)
    if (path === '/mcp/tools/list' && req.method === 'GET') {
      const result = await handleJsonRpcRequest('tools/list', undefined);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/mcp/tools/call' && req.method === 'POST') {
      const body = await req.json();
      const result = await handleJsonRpcRequest('tools/call', body);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/mcp/resources/list' && req.method === 'GET') {
      const result = await handleJsonRpcRequest('resources/list', undefined);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/mcp/prompts/list' && req.method === 'GET') {
      const result = await handleJsonRpcRequest('prompts/list', undefined);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (path === '/mcp/health' && req.method === 'GET') {
      const backendHealth = await Promise.all(
        BACKEND_SERVERS.map((server) => checkBackendHealth(server))
      );
      const allHealthy = backendHealth.every((b) => b.status === 'healthy');
      const anyHealthy = backendHealth.some((b) => b.status === 'healthy');

      return new Response(
        JSON.stringify({
          status: allHealthy ? 'UP' : anyHealthy ? 'DEGRADED' : 'DOWN',
          timestamp: new Date().toISOString(),
          servers: backendHealth.map((b) => ({
            id: b.id,
            name: b.name,
            endpoint: BACKEND_SERVERS.find((s) => s.id === b.id)?.endpoint,
            status: b.status === 'healthy' ? 'HEALTHY' : 'DOWN',
            latency: b.latencyMs,
            errorMessage: b.error,
          })),
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    if (path === '/mcp/metrics' && req.method === 'GET') {
      const uptimeMs = Date.now() - metrics.startTime;
      return new Response(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          uptime: `${Math.floor(uptimeMs / 1000)}s`,
          requests: {
            total: metrics.totalRequests,
            errors: metrics.totalErrors,
            errorRate:
              metrics.totalRequests > 0
                ? `${((metrics.totalErrors / metrics.totalRequests) * 100).toFixed(2)}%`
                : '0%',
          },
          latency: {
            avg: '0ms',
            p50: '0ms',
            p95: '0ms',
            p99: '0ms',
          },
          cache: {
            hitRate: '0%',
            memorySize: 0,
          },
          endpoints: {},
        }),
        {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // 404 for unknown paths
    return new Response(
      JSON.stringify({ error: 'Not Found', path }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    metrics.totalErrors++;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Request error:', errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
}

// =============================================================================
// Server Startup
// =============================================================================

const port = parseInt(Deno.env.get('PORT') || '8000');

console.log(`
========================================
  MCP Gateway Server v${SERVER_INFO.version}
========================================
  Streamable HTTP: http://localhost:${port}/mcp
  SSE Transport:   http://localhost:${port}/sse
  Health Check:    http://localhost:${port}/health
  Metrics:         http://localhost:${port}/metrics
  Tools List:      http://localhost:${port}/mcp/tools/list
----------------------------------------
  Backend Servers:
${BACKEND_SERVERS.map((s) => `    - ${s.name} (${s.id})`).join('\n')}
========================================
`);

Deno.serve({ port }, handler);
