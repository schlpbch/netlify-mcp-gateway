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
  McpTool,
  McpResource,
  McpPrompt,
} from '../types/mcp.ts';
import { ServerRegistry } from '../registry/ServerRegistry.ts';
import { IntelligentRouter } from '../routing/IntelligentRouter.ts';
import { addNamespace } from '../registry/NamespaceResolver.ts';
import { BackendMcpClient } from '../client/BackendMcpClient.ts';
import { ResponseCache } from '../cache/ResponseCache.ts';
import { aggregateFromServers } from '../utils/aggregateFromServers.ts';

// Cache TTLs for list operations (in seconds)
const LIST_CACHE_TTL = 60; // 1 minute for list responses

/**
 * MCP protocol handler - aggregates capabilities and routes requests
 */
export class McpProtocolHandler {
  private cache: ResponseCache | null = null;

  constructor(
    private registry: ServerRegistry,
    private router: IntelligentRouter,
    private client: BackendMcpClient
  ) {}

  /**
   * Set cache instance for list response caching
   */
  setCache(cache: ResponseCache): void {
    this.cache = cache;
  }

  /**
   * List all tools from all healthy servers (fetched in parallel)
   * Results are cached for 1 minute to improve performance
   */
  async listTools(): Promise<McpListToolsResponse> {
    const cacheKey = 'list:tools';

    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get<McpListToolsResponse>(cacheKey);
      if (cached) {
        console.log('Cache hit for tools list');
        return cached;
      }
    }

    const servers = this.registry.listHealthyServers();

    const tools = await aggregateFromServers<McpTool>(
      servers,
      async (server) => {
        const response = await this.client.listTools(server);
        const serverTools = response?.tools || [];
        return serverTools.map((tool) => ({
          ...tool,
          name: addNamespace(server.id, tool.name),
          description: tool.description || `${tool.name} from ${server.name}`,
        }));
      },
      'tools'
    );

    const result = { tools };

    // Cache the result
    if (this.cache) {
      await this.cache.set(cacheKey, result, LIST_CACHE_TTL);
    }

    return result;
  }

  /**
   * Call a tool
   */
  async callTool(request: McpToolCallRequest): Promise<McpToolCallResponse> {
    return await this.router.routeToolCall(request.name, request.arguments);
  }

  /**
   * List all resources from all healthy servers (fetched in parallel)
   * Results are cached for 1 minute to improve performance
   */
  async listResources(): Promise<McpListResourcesResponse> {
    const cacheKey = 'list:resources';

    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get<McpListResourcesResponse>(cacheKey);
      if (cached) {
        console.log('Cache hit for resources list');
        return cached;
      }
    }

    const servers = this.registry.listHealthyServers();

    // Aggregate resources from all servers, preserving the original URI
    const allResources: McpResource[] = [];

    for (const server of servers) {
      try {
        const response = await this.client.listResources(server);
        if (response?.resources) {
          // Keep resources as-is without modifying URIs
          console.log(`[Protocol] Resources from ${server.id}:`, response.resources.map(r => ({ name: r.name, uri: r.uri })));
          allResources.push(...response.resources);
        }
      } catch (error) {
        console.error(`Failed to get resources from server ${server.id}:`, error);
        // Continue with other servers
      }
    }

    const result = { resources: allResources };

    // Cache the result
    if (this.cache) {
      await this.cache.set(cacheKey, result, LIST_CACHE_TTL);
    }

    return result;
  }

  /**
   * Read a resource
   */
  async readResource(
    request: McpResourceReadRequest
  ): Promise<McpResourceReadResponse> {
    return await this.router.routeResourceRead(request.uri);
  }

  /**
   * List all prompts from all healthy servers (fetched in parallel)
   * Results are cached for 1 minute to improve performance
   */
  async listPrompts(): Promise<McpListPromptsResponse> {
    const cacheKey = 'list:prompts';

    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get<McpListPromptsResponse>(cacheKey);
      if (cached) {
        console.log('Cache hit for prompts list');
        return cached;
      }
    }

    const servers = this.registry.listHealthyServers();

    const prompts = await aggregateFromServers<McpPrompt>(
      servers,
      async (server) => {
        const response = await this.client.listPrompts(server);
        const serverPrompts = response?.prompts || [];
        return serverPrompts.map((prompt) => ({
          ...prompt,
          name: addNamespace(server.id, prompt.name),
          description:
            prompt.description || `${prompt.name} from ${server.name}`,
        }));
      },
      'prompts'
    );

    const result = { prompts };

    // Cache the result
    if (this.cache) {
      await this.cache.set(cacheKey, result, LIST_CACHE_TTL);
    }

    return result;
  }

  /**
   * Get a prompt
   */
  async getPrompt(request: McpPromptGetRequest): Promise<McpPromptGetResponse> {
    return await this.router.routePromptGet(request.name, request.arguments);
  }
}
