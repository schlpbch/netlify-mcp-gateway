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
   * List all tools from all healthy servers
   */
  async listTools(): Promise<McpListToolsResponse> {
    const servers = this.registry.listHealthyServers();
    const allTools = [];

    for (const server of servers) {
      try {
        const response = await this.client.listTools(server);
        const tools = response?.tools || [];
        const namespacedTools = tools.map((tool) => ({
          ...tool,
          name: addNamespace(server.id, tool.name),
          description: tool.description || `${tool.name} from ${server.name}`,
        }));
        allTools.push(...namespacedTools);
      } catch (error) {
        console.error(`Failed to list tools from ${server.id}:`, error);
      }
    }

    return { tools: allTools };
  }

  /**
   * Call a tool
   */
  async callTool(request: McpToolCallRequest): Promise<McpToolCallResponse> {
    return await this.router.routeToolCall(request.name, request.arguments);
  }

  /**
   * List all resources from all healthy servers
   */
  async listResources(): Promise<McpListResourcesResponse> {
    const servers = this.registry.listHealthyServers();
    const allResources = [];

    for (const server of servers) {
      try {
        const response = await this.client.listResources(server);
        const resources = response?.resources || [];
        allResources.push(...resources);
      } catch (error) {
        console.error(`Failed to list resources from ${server.id}:`, error);
      }
    }

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
   * List all prompts from all healthy servers
   */
  async listPrompts(): Promise<McpListPromptsResponse> {
    const servers = this.registry.listHealthyServers();
    const allPrompts = [];

    for (const server of servers) {
      try {
        const response = await this.client.listPrompts(server);
        const prompts = response?.prompts || [];
        const namespacedPrompts = prompts.map((prompt) => ({
          ...prompt,
          name: addNamespace(server.id, prompt.name),
          description:
            prompt.description || `${prompt.name} from ${server.name}`,
        }));
        allPrompts.push(...namespacedPrompts);
      } catch (error) {
        console.error(`Failed to list prompts from ${server.id}:`, error);
      }
    }

    return { prompts: allPrompts };
  }

  /**
   * Get a prompt
   */
  async getPrompt(request: McpPromptGetRequest): Promise<McpPromptGetResponse> {
    return await this.router.routePromptGet(request.name, request.arguments);
  }
}
