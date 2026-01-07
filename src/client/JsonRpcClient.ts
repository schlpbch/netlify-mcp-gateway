import type { RoutingConfig } from '../types/config.ts';
import type { SessionManager } from './SessionManager.ts';

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
 * JSON-RPC client for MCP protocol.
 * Handles request/response formatting, SSE parsing, and retry logic.
 */
export class JsonRpcClient {
  constructor(
    private config: RoutingConfig,
    private sessionManager: SessionManager
  ) {}

  /**
   * Send JSON-RPC request with optional session support
   */
  async send<T>(
    endpoint: string,
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
    serverId?: string
  ): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.sessionManager.nextRequestId(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    // Add session ID if server requires it
    if (serverId) {
      const sessionId = await this.sessionManager.getOrInitializeSession(
        serverId,
        endpoint,
        timeoutMs
      );
      if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs || this.config.timeout.read),
    });

    if (!response.ok) {
      // If we get a session error, clear the session and retry once
      if (serverId && response.status === 400) {
        const text = await response.text();
        if (text.includes('Mcp-Session-Id') || text.includes('session')) {
          console.log(`Session expired for ${serverId}, re-initializing...`);
          this.sessionManager.clearSession(serverId);
          const newSessionId = await this.sessionManager.initializeSession(
            serverId,
            endpoint,
            timeoutMs
          );
          if (newSessionId) {
            headers['Mcp-Session-Id'] = newSessionId;
            const retryResponse = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(request),
              signal: AbortSignal.timeout(timeoutMs || this.config.timeout.read),
            });
            if (retryResponse.ok) {
              const retryText = await retryResponse.text();
              return this.parseResponse<T>(retryText);
            }
          }
        }
      }
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    return this.parseResponse<T>(text);
  }

  /**
   * Send request with retry logic
   */
  async sendWithRetry<T>(
    endpoint: string,
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
    serverId?: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
      try {
        return await this.send<T>(endpoint, method, params, timeoutMs, serverId);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.config.retry.maxAttempts - 1) {
          break;
        }

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

  /**
   * Parse response (handles both plain JSON and SSE format)
   */
  private parseResponse<T>(text: string): T {
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
}
