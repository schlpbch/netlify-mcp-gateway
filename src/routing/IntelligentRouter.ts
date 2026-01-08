import type {
  McpPromptGetResponse,
  McpResourceReadResponse,
  McpToolCallResponse,
} from '../types/mcp.ts';
import { HealthStatus } from '../types/server.ts';
import { ServerRegistry } from '../registry/ServerRegistry.ts';
import { BackendMcpClient } from '../client/BackendMcpClient.ts';
import { ResponseCache } from '../cache/ResponseCache.ts';
import { stripNamespace } from '../registry/NamespaceResolver.ts';

/**
 * Intelligent router with cache-aware routing and health checking
 */
export class IntelligentRouter {
  constructor(
    private registry: ServerRegistry,
    private client: BackendMcpClient,
    private cache: ResponseCache
  ) {}

  /**
   * Route a tool call with caching
   */
  async routeToolCall(
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<McpToolCallResponse> {
    // 1. Check cache
    const cacheKey = this.cache.generateKey(toolName, args);
    const cached = await this.cache.get<McpToolCallResponse>(cacheKey);
    if (cached) {
      console.log(`Cache hit for tool: ${toolName}`);
      return cached;
    }

    // 2. Resolve server
    const server = this.registry.resolveToolServer(toolName);

    // 3. Check health
    if (server.health.status !== HealthStatus.HEALTHY) {
      throw new Error(
        `Server ${server.id} is unhealthy (status: ${server.health.status})`
      );
    }

    // 4. Call backend
    const bareToolName = stripNamespace(toolName);
    const result = await this.client.callTool(server, bareToolName, args);

    // 5. Cache result
    const ttl = this.determineTTL(toolName);
    await this.cache.set(cacheKey, result, ttl);

    return result;
  }

  /**
   * Route a resource read request
   */
  async routeResourceRead(uri: string): Promise<McpResourceReadResponse> {
    // Resources are typically not cached as they may be dynamic
    console.log('[Router] routeResourceRead called with URI:', uri);
    const server = this.registry.resolveResourceServer(uri);
    console.log('[Router] Resolved server:', server.id);

    if (server.health.status !== HealthStatus.HEALTHY) {
      throw new Error(
        `Server ${server.id} is unhealthy (status: ${server.health.status})`
      );
    }

    // Strip the scheme prefix from the URI before sending to the server
    // (e.g., "about://service" -> "service")
    // The server will add its own namespace prefix, so we only need the path
    const pathOnly = uri.includes('://') ? uri.split('://')[1] : uri;
    console.log('[Router] Stripped URI:', pathOnly);

    const result = await this.client.readResource(server, pathOnly);
    console.log('[Router] Resource read result:', result);
    return result;
  }

  /**
   * Route a prompt get request
   */
  async routePromptGet(
    promptName: string,
    args?: Record<string, unknown>
  ): Promise<McpPromptGetResponse> {
    const server = this.registry.resolvePromptServer(promptName);

    if (server.health.status !== HealthStatus.HEALTHY) {
      throw new Error(
        `Server ${server.id} is unhealthy (status: ${server.health.status})`
      );
    }

    const barePromptName = stripNamespace(promptName);
    return await this.client.getPrompt(server, barePromptName, args);
  }

  /**
   * Determine TTL based on tool characteristics
   */
  private determineTTL(toolName: string): number {
    // Static data: longer TTL
    if (toolName.includes('location') || toolName.includes('station')) {
      return 3600; // 1 hour
    }

    // Real-time data: shorter TTL
    if (
      toolName.includes('trip') ||
      toolName.includes('journey') ||
      toolName.includes('weather') ||
      toolName.includes('conditions')
    ) {
      return 60; // 1 minute
    }

    // Default TTL
    return 300; // 5 minutes
  }
}
