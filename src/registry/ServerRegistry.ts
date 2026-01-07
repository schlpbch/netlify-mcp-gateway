import type {
  ServerRegistration,
  ServerHealth,
  ServerCapabilities,
} from '../types/server.ts';
import { HealthStatus } from '../types/server.ts';
import { extractServerId } from './NamespaceResolver.ts';

/**
 * Thread-safe server registry managing backend MCP server registrations
 */
export class ServerRegistry {
  private servers: Map<string, ServerRegistration> = new Map();
  private static instance: ServerRegistry | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ServerRegistry {
    if (!this.instance) {
      this.instance = new ServerRegistry();
    }
    return this.instance;
  }

  /**
   * Register a new server
   */
  register(server: ServerRegistration): void {
    this.servers.set(server.id, server);
    console.log(`Registered server: ${server.id} (${server.name})`);
  }

  /**
   * Unregister a server
   */
  unregister(serverId: string): void {
    this.servers.delete(serverId);
    console.log(`Unregistered server: ${serverId}`);
  }

  /**
   * Get a server by ID
   */
  getServer(serverId: string): ServerRegistration | undefined {
    return this.servers.get(serverId);
  }

  /**
   * List all registered servers
   */
  listServers(): ServerRegistration[] {
    return Array.from(this.servers.values());
  }

  /**
   * List only healthy servers
   */
  listHealthyServers(): ServerRegistration[] {
    return this.listServers().filter(
      (server) => server.health.status === HealthStatus.HEALTHY
    );
  }

  /**
   * Resolve which server provides a given tool
   */
  resolveToolServer(toolName: string): ServerRegistration {
    const serverId = extractServerId(toolName);
    const server = this.servers.get(serverId);

    if (!server) {
      throw new Error(
        `Server not found for tool: ${toolName} (resolved to ${serverId})`
      );
    }

    return server;
  }

  /**
   * Resolve which server provides a given resource
   */
  resolveResourceServer(uri: string): ServerRegistration {
    // Extract server ID from URI prefix (e.g., "journey://..." -> "journey-service-mcp")
    const serverId = extractServerId(uri);
    const server = this.servers.get(serverId);

    if (!server) {
      throw new Error(
        `Server not found for resource: ${uri} (resolved to ${serverId})`
      );
    }

    return server;
  }

  /**
   * Resolve which server provides a given prompt
   */
  resolvePromptServer(promptName: string): ServerRegistration {
    const serverId = extractServerId(promptName);
    const server = this.servers.get(serverId);

    if (!server) {
      throw new Error(
        `Server not found for prompt: ${promptName} (resolved to ${serverId})`
      );
    }

    return server;
  }

  /**
   * Update server health status
   */
  updateHealth(serverId: string, health: ServerHealth): void {
    const server = this.servers.get(serverId);
    if (server) {
      this.servers.set(serverId, { ...server, health });
    }
  }

  /**
   * Update server capabilities
   */
  updateCapabilities(serverId: string, capabilities: ServerCapabilities): void {
    const server = this.servers.get(serverId);
    if (server) {
      this.servers.set(serverId, { ...server, capabilities });
    }
  }

  /**
   * Clear all servers (for testing)
   */
  clear(): void {
    this.servers.clear();
  }
}
