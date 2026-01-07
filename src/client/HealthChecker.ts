import type { ServerRegistration, ServerHealth } from '../types/server.ts';
import type { RoutingConfig } from '../types/config.ts';
import type { SessionManager } from './SessionManager.ts';
import { HealthStatus } from '../types/server.ts';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

/**
 * Health checker for backend MCP servers.
 * Uses a two-tier strategy:
 * 1. Try Spring Boot actuator endpoint first (fast, standard)
 * 2. Fall back to MCP ping if actuator fails (works for FastMCP/non-Spring servers)
 */
export class HealthChecker {
  constructor(
    private config: RoutingConfig,
    private sessionManager: SessionManager
  ) {}

  /**
   * Check health of a backend server
   */
  async checkHealth(server: ServerRegistration): Promise<ServerHealth> {
    const startTime = Date.now();

    // First, try Spring Boot actuator health endpoint
    const actuatorResult = await this.checkActuatorHealth(server, startTime);
    if (actuatorResult) {
      return actuatorResult;
    }

    // Fall back to MCP-based health check
    return await this.checkMcpHealth(server, startTime);
  }

  /**
   * Try Spring Boot actuator health endpoint
   */
  private async checkActuatorHealth(
    server: ServerRegistration,
    startTime: number
  ): Promise<ServerHealth | null> {
    try {
      const actuatorUrl = server.endpoint.endsWith('/mcp')
        ? server.endpoint.replace('/mcp', '/actuator/health')
        : `${server.endpoint}/actuator/health`;

      const response = await fetch(actuatorUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(this.config.timeout.connect),
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        return {
          status: HealthStatus.HEALTHY,
          lastCheck: new Date(),
          latency,
          consecutiveFailures: 0,
        };
      }
    } catch {
      // Actuator failed, will fall back to MCP check
    }

    return null;
  }

  /**
   * Check health using MCP initialize request
   */
  private async checkMcpHealth(
    server: ServerRegistration,
    startTime: number
  ): Promise<ServerHealth> {
    try {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'netlify-mcp-gateway-health', version: '1.0.0' },
        },
        id: this.sessionManager.nextRequestId(),
      };

      const response = await fetch(server.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeout.connect),
      });

      const latency = Date.now() - startTime;

      if (response.ok) {
        // Store session if returned (for session-based servers)
        const sessionId = response.headers.get('mcp-session-id');
        if (sessionId) {
          this.sessionManager.setSession(server.id, sessionId);
        }

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
          errorMessage: `MCP HTTP ${response.status}`,
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
}
