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
import { aggregateFromServers } from '../utils/aggregateFromServers.ts';

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

    return { tools };
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

    const resources = await aggregateFromServers<McpResource>(
      servers,
      async (server) => {
        const response = await this.client.listResources(server);
        return response?.resources || [];
      },
      'resources'
    );

    return { resources };
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

    return { prompts };
  }

  /**
   * Get a prompt
   */
  async getPrompt(request: McpPromptGetRequest): Promise<McpPromptGetResponse> {
    return await this.router.routePromptGet(request.name, request.arguments);
  }
}
