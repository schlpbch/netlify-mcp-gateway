// MCP Protocol Types

// Tool Call
export interface McpToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpToolCallResponse {
  content: McpContent[];
  isError?: boolean;
}

// Resource Read
export interface McpResourceReadRequest {
  uri: string;
}

export interface McpResourceReadResponse {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
}

// Prompt Get
export interface McpPromptGetRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: McpContent;
}

export interface McpPromptGetResponse {
  description?: string;
  messages: McpPromptMessage[];
}

// List Responses
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpListToolsResponse {
  tools: McpTool[];
}

export interface McpListResourcesResponse {
  resources: McpResource[];
}

export interface McpListPromptsResponse {
  prompts: McpPrompt[];
}
