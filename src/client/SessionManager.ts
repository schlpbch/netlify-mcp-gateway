import type { RoutingConfig } from '../types/config.ts';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

/**
 * Manages MCP sessions for Streamable HTTP transport.
 * Sessions are server-specific and identified by Mcp-Session-Id header.
 */
export class SessionManager {
  private sessions: Map<string, string> = new Map();
  private requestId = 0;

  constructor(private config: RoutingConfig) {}

  /**
   * Get existing session for a server
   */
  getSession(serverId: string): string | undefined {
    return this.sessions.get(serverId);
  }

  /**
   * Store a session for a server
   */
  setSession(serverId: string, sessionId: string): void {
    this.sessions.set(serverId, sessionId);
    console.log(`Stored session for ${serverId}: ${sessionId}`);
  }

  /**
   * Clear a session for a server
   */
  clearSession(serverId: string): void {
    this.sessions.delete(serverId);
    console.log(`Cleared session for ${serverId}`);
  }

  /**
   * Get or initialize a session for a server
   */
  async getOrInitializeSession(
    serverId: string,
    endpoint: string,
    timeoutMs?: number
  ): Promise<string | null> {
    const existingSession = this.sessions.get(serverId);
    if (existingSession) {
      return existingSession;
    }

    return await this.initializeSession(serverId, endpoint, timeoutMs);
  }

  /**
   * Initialize a new session with a backend server
   */
  async initializeSession(
    serverId: string,
    endpoint: string,
    timeoutMs?: number
  ): Promise<string | null> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'netlify-mcp-gateway', version: '1.0.0' },
      },
      id: ++this.requestId,
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeoutMs || this.config.timeout.connect),
      });

      if (!response.ok) {
        return null;
      }

      const sessionId = response.headers.get('mcp-session-id');
      if (sessionId) {
        this.sessions.set(serverId, sessionId);
        console.log(`Initialized session for ${serverId}: ${sessionId}`);
      }

      return sessionId;
    } catch (error) {
      console.warn(`Failed to initialize session for ${serverId}:`, error);
      return null;
    }
  }

  /**
   * Get next request ID (shared across the client)
   */
  nextRequestId(): number {
    return ++this.requestId;
  }
}
