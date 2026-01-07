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
import { ServerRegistry } from '../registry/ServerRegistry.ts';
import { IntelligentRouter } from '../routing/IntelligentRouter.ts';
import { addNamespace } from '../registry/NamespaceResolver.ts';
import { BackendMcpClient } from '../client/BackendMcpClient.ts';

/**
 * MCP protocol handler - aggregates capabilities and routes requests
 */
export class McpProtocolHandler {
  constructor(
    private registry: ServerRegistry,
    private router: IntelligentRouter,
    private client: BackendMcpClient
  ) {}

  /**
   * List all tools from all healthy servers (fetched in parallel)
   */
  async listTools(): Promise<McpListToolsResponse> {
    const servers = this.registry.listHealthyServers();

    const results = await Promise.allSettled(
      servers.map(async (server) => {
        const response = await this.client.listTools(server);
        const tools = response?.tools || [];
        return tools.map((tool) => ({
          ...tool,
          name: addNamespace(server.id, tool.name),
          description: tool.description || `${tool.name} from ${server.name}`,
        }));
      })
    );

    const allTools = results
      .filter((r): r is PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    // Log failures
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Failed to list tools from ${servers[i].id}:`, r.reason);
      }
    });

    return { tools: allTools };
  }

  /**
   * Call a tool
   */
  async callTool(request: McpToolCallRequest): Promise<McpToolCallResponse> {
    return await this.router.routeToolCall(request.name, request.arguments);
  }

  /**
   * List all resources from all healthy servers (fetched in parallel)
   */
  async listResources(): Promise<McpListResourcesResponse> {
    const servers = this.registry.listHealthyServers();

    const results = await Promise.allSettled(
      servers.map(async (server) => {
        const response = await this.client.listResources(server);
        return response?.resources || [];
      })
    );

    const allResources = results
      .filter((r): r is PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Failed to list resources from ${servers[i].id}:`, r.reason);
      }
    });

    return { resources: allResources };
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
   */
  async listPrompts(): Promise<McpListPromptsResponse> {
    const servers = this.registry.listHealthyServers();

    const results = await Promise.allSettled(
      servers.map(async (server) => {
        const response = await this.client.listPrompts(server);
        const prompts = response?.prompts || [];
        return prompts.map((prompt) => ({
          ...prompt,
          name: addNamespace(server.id, prompt.name),
          description:
            prompt.description || `${prompt.name} from ${server.name}`,
        }));
      })
    );

    const allPrompts = results
      .filter((r): r is PromiseFulfilledResult<typeof r extends PromiseFulfilledResult<infer T> ? T : never> => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Failed to list prompts from ${servers[i].id}:`, r.reason);
      }
    });

    return { prompts: allPrompts };
  }

  /**
   * Get a prompt
   */
  async getPrompt(request: McpPromptGetRequest): Promise<McpPromptGetResponse> {
    return await this.router.routePromptGet(request.name, request.arguments);
  }
}
