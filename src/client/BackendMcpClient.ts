import type { ServerRegistration, ServerHealth } from '../types/server.ts';
import type {
  McpListPromptsResponse,
  McpListResourcesResponse,
  McpListToolsResponse,
  McpPromptGetRequest,
  McpPromptGetResponse,
  McpResourceReadRequest,
  McpResourceReadResponse,
  McpToolCallRequest,
  McpToolCallResponse,
} from '../types/mcp.ts';
import type { RoutingConfig } from '../types/config.ts';
import { HealthStatus } from '../types/server.ts';

/**
 * HTTP client for communicating with backend MCP servers
 */
export class BackendMcpClient {
  constructor(private config: RoutingConfig) {}

  /**
   * Call a tool on a backend server with retry logic
   */
  async callTool(
    server: ServerRegistration,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<McpToolCallResponse> {
    const request: McpToolCallRequest = {
      name: toolName,
      arguments: args,
    };

    return await this.retryRequest(async () => {
      const response = await fetch(`${server.endpoint}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeout.read),
      });

      if (!response.ok) {
        throw new Error(
          `Tool call failed: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    });
  }

  /**
   * Read a resource from a backend server
   */
  async readResource(
    server: ServerRegistration,
    uri: string
  ): Promise<McpResourceReadResponse> {
    const request: McpResourceReadRequest = { uri };

    return await this.retryRequest(async () => {
      const response = await fetch(`${server.endpoint}/resources/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeout.read),
      });

      if (!response.ok) {
        throw new Error(
          `Resource read failed: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
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
    const request: McpPromptGetRequest = {
      name: promptName,
      arguments: args,
    };

    return await this.retryRequest(async () => {
      const response = await fetch(`${server.endpoint}/prompts/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeout.read),
      });

      if (!response.ok) {
        throw new Error(
          `Prompt get failed: ${response.status} ${response.statusText}`
        );
      }

      return await response.json();
    });
  }

  /**
   * List tools from a backend server
   */
  async listTools(server: ServerRegistration): Promise<McpListToolsResponse> {
    const response = await fetch(`${server.endpoint}/tools/list`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout.read),
    });

    if (!response.ok) {
      throw new Error(
        `List tools failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * List resources from a backend server
   */
  async listResources(
    server: ServerRegistration
  ): Promise<McpListResourcesResponse> {
    const response = await fetch(`${server.endpoint}/resources/list`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout.read),
    });

    if (!response.ok) {
      throw new Error(
        `List resources failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * List prompts from a backend server
   */
  async listPrompts(
    server: ServerRegistration
  ): Promise<McpListPromptsResponse> {
    const response = await fetch(`${server.endpoint}/prompts/list`, {
      method: 'GET',
      signal: AbortSignal.timeout(this.config.timeout.read),
    });

    if (!response.ok) {
      throw new Error(
        `List prompts failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
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
