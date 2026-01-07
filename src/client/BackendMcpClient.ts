import type { ServerRegistration, ServerHealth } from '../types/server.ts';
import type {
  McpListPromptsResponse,
  McpListResourcesResponse,
  McpListToolsResponse,
  McpPromptGetResponse,
  McpResourceReadResponse,
  McpToolCallResponse,
} from '../types/mcp.ts';
import type { RoutingConfig } from '../types/config.ts';
import { HealthStatus } from '../types/server.ts';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * HTTP client for communicating with backend MCP servers using JSON-RPC
 */
export class BackendMcpClient {
  private requestId = 0;

  constructor(private config: RoutingConfig) {}

  /**
   * Send JSON-RPC request and parse SSE response
   */
  private async sendJsonRpc<T>(
    endpoint: string,
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: ++this.requestId,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs || this.config.timeout.read),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    // Parse SSE format: "event: message\ndata: {...}"
    const jsonRpcResponse = this.parseSSEResponse<T>(text);

    if (jsonRpcResponse.error) {
      throw new Error(`JSON-RPC error: ${jsonRpcResponse.error.message}`);
    }

    if (jsonRpcResponse.result === undefined) {
      throw new Error('No result in JSON-RPC response');
    }

    return jsonRpcResponse.result;
  }

  /**
   * Parse SSE response format to extract JSON-RPC response
   */
  private parseSSEResponse<T>(text: string): JsonRpcResponse<T> {
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

  /**
   * Call a tool on a backend server with retry logic
   */
  async callTool(
    server: ServerRegistration,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<McpToolCallResponse> {
    return await this.retryRequest(async () => {
      return await this.sendJsonRpc<McpToolCallResponse>(
        server.endpoint,
        'tools/call',
        { name: toolName, arguments: args }
      );
    });
  }

  /**
   * Read a resource from a backend server
   */
  async readResource(
    server: ServerRegistration,
    uri: string
  ): Promise<McpResourceReadResponse> {
    return await this.retryRequest(async () => {
      return await this.sendJsonRpc<McpResourceReadResponse>(
        server.endpoint,
        'resources/read',
        { uri }
      );
    });
  }

  /**
   * Get a prompt from a backend server
   */
  async getPrompt(
    server: ServerRegistration,
    promptName: string,
    args?: Record<string, unknown>
  ): Promise<McpPromptGetResponse> {
    return await this.retryRequest(async () => {
      return await this.sendJsonRpc<McpPromptGetResponse>(
        server.endpoint,
        'prompts/get',
        { name: promptName, arguments: args }
      );
    });
  }

  /**
   * List tools from a backend server (with 5s timeout for responsiveness)
   */
  async listTools(server: ServerRegistration): Promise<McpListToolsResponse> {
    return await this.sendJsonRpc<McpListToolsResponse>(
      server.endpoint,
      'tools/list',
      {},
      5000
    );
  }

  /**
   * List resources from a backend server (with 5s timeout for responsiveness)
   */
  async listResources(
    server: ServerRegistration
  ): Promise<McpListResourcesResponse> {
    return await this.sendJsonRpc<McpListResourcesResponse>(
      server.endpoint,
      'resources/list',
      {},
      5000
    );
  }

  /**
   * List prompts from a backend server (with 5s timeout for responsiveness)
   */
  async listPrompts(
    server: ServerRegistration
  ): Promise<McpListPromptsResponse> {
    return await this.sendJsonRpc<McpListPromptsResponse>(
      server.endpoint,
      'prompts/list',
      {},
      5000
    );
  }

  /**
   * Check health of a backend server
   */
  async checkHealth(server: ServerRegistration): Promise<ServerHealth> {
    const startTime = Date.now();

    try {
      const response = await fetch(
        `${server.endpoint.replace('/mcp', '')}/actuator/health`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(this.config.timeout.connect),
        }
      );

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          status: HealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency,
          consecutiveFailures: 0,
        };
      } else {
        return {
          status: HealthStatus.DEGRADED,
          lastCheck: new Date(),
          latency,
          errorMessage: `HTTP ${response.status}`,
          consecutiveFailures: server.health.consecutiveFailures + 1,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        status: HealthStatus.DOWN,
        lastCheck: new Date(),
        latency,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: server.health.consecutiveFailures + 1,
      };
    }
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on last attempt
        if (attempt === this.config.retry.maxAttempts - 1) {
          break;
        }

        // Calculate backoff delay
        const delay = Math.min(
          this.config.retry.backoffDelay *
            Math.pow(this.config.retry.backoffMultiplier, attempt),
          this.config.retry.maxDelay
        );

        console.warn(
          `Request failed (attempt ${attempt + 1}), retrying in ${delay}ms:`,
          lastError.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Request failed after retries');
  }
}
