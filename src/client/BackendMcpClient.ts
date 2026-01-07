import type { ServerRegistration, ServerHealth } from '../types/server.ts';
import type {
  McpListPromptsResponse,
  McpListResourcesResponse,
  McpListToolsResponse,
  McpPromptGetResponse,
  McpResourceReadResponse,
  McpToolCallResponse,
} from '../types/mcp.ts';
import type { RoutingConfig } from '../types/config.ts';
import { SessionManager } from './SessionManager.ts';
import { JsonRpcClient } from './JsonRpcClient.ts';
import { HealthChecker } from './HealthChecker.ts';

/**
 * HTTP client for communicating with backend MCP servers using JSON-RPC.
 * Orchestrates session management, JSON-RPC communication, and health checks.
 *
 * Supports both stateless and session-based (Streamable HTTP) MCP transports.
 */
export class BackendMcpClient {
  private sessionManager: SessionManager;
  private jsonRpcClient: JsonRpcClient;
  private healthChecker: HealthChecker;

  constructor(config: RoutingConfig) {
    this.sessionManager = new SessionManager(config);
    this.jsonRpcClient = new JsonRpcClient(config, this.sessionManager);
    this.healthChecker = new HealthChecker(config, this.sessionManager);
  }

  /**
   * Call a tool on a backend server with retry logic
   */
  async callTool(
    server: ServerRegistration,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<McpToolCallResponse> {
    return await this.jsonRpcClient.sendWithRetry<McpToolCallResponse>(
      server.endpoint,
      'tools/call',
      { name: toolName, arguments: args },
      undefined,
      server.id
    );
  }

  /**
   * Read a resource from a backend server
   */
  async readResource(
    server: ServerRegistration,
    uri: string
  ): Promise<McpResourceReadResponse> {
    return await this.jsonRpcClient.sendWithRetry<McpResourceReadResponse>(
      server.endpoint,
      'resources/read',
      { uri },
      undefined,
      server.id
    );
  }

  /**
   * Get a prompt from a backend server
   */
  async getPrompt(
    server: ServerRegistration,
    promptName: string,
    args?: Record<string, unknown>
  ): Promise<McpPromptGetResponse> {
    return await this.jsonRpcClient.sendWithRetry<McpPromptGetResponse>(
      server.endpoint,
      'prompts/get',
      { name: promptName, arguments: args },
      undefined,
      server.id
    );
  }

  /**
   * List tools from a backend server (with 5s timeout for responsiveness)
   */
  async listTools(server: ServerRegistration): Promise<McpListToolsResponse> {
    return await this.jsonRpcClient.send<McpListToolsResponse>(
      server.endpoint,
      'tools/list',
      {},
      5000,
      server.id
    );
  }

  /**
   * List resources from a backend server (with 5s timeout for responsiveness)
   */
  async listResources(
    server: ServerRegistration
  ): Promise<McpListResourcesResponse> {
    return await this.jsonRpcClient.send<McpListResourcesResponse>(
      server.endpoint,
      'resources/list',
      {},
      5000,
      server.id
    );
  }

  /**
   * List prompts from a backend server (with 5s timeout for responsiveness)
   */
  async listPrompts(
    server: ServerRegistration
  ): Promise<McpListPromptsResponse> {
    return await this.jsonRpcClient.send<McpListPromptsResponse>(
      server.endpoint,
      'prompts/list',
      {},
      5000,
      server.id
    );
  }

  /**
   * Check health of a backend server
   */
  async checkHealth(server: ServerRegistration): Promise<ServerHealth> {
    return await this.healthChecker.checkHealth(server);
  }
}
