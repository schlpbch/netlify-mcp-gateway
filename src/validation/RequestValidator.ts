/**
 * Request Validation Schemas
 * TypeScript interfaces and validation functions for MCP Gateway requests
 */

export interface ToolCallRequest {
  tool: string;
  arguments?: Record<string, unknown>;
}

export interface ResourceReadRequest {
  uri: string;
}

export interface PromptGetRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface HealthCheckResponse {
  status: 'UP' | 'DEGRADED' | 'DOWN';
  servers: Array<{
    id: string;
    name: string;
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    endpoint: string;
    latency: number;
    errorMessage?: string;
  }>;
  timestamp: string;
}

/**
 * Validation errors
 */
export class ValidationError extends Error {
  constructor(public field: string, public reason: string) {
    super(`Validation error: ${field} - ${reason}`);
  }
}

/**
 * Validate tool call request
 */
export const validateToolCall = (data: unknown): ToolCallRequest => {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('body', 'Request must be a JSON object');
  }

  const obj = data as Record<string, unknown>;

  if (!obj.tool || typeof obj.tool !== 'string') {
    throw new ValidationError('tool', 'Tool name must be a non-empty string');
  }

  if (!/^[a-zA-Z0-9._-]+\.?[a-zA-Z0-9._-]*$/.test(obj.tool)) {
    throw new ValidationError('tool', 'Invalid tool name format');
  }

  if (obj.arguments !== undefined && typeof obj.arguments !== 'object') {
    throw new ValidationError('arguments', 'Arguments must be an object');
  }

  return {
    tool: obj.tool,
    arguments: obj.arguments as Record<string, unknown>,
  };
};

/**
 * Validate resource read request
 */
export const validateResourceRead = (data: unknown): ResourceReadRequest => {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('body', 'Request must be a JSON object');
  }

  const obj = data as Record<string, unknown>;

  if (!obj.uri || typeof obj.uri !== 'string') {
    throw new ValidationError('uri', 'Resource URI must be a non-empty string');
  }

  // Basic URI validation
  try {
    new URL(obj.uri);
  } catch {
    throw new ValidationError('uri', 'Invalid URI format');
  }

  return {
    uri: obj.uri,
  };
};

/**
 * Validate prompt get request
 */
export const validatePromptGet = (data: unknown): PromptGetRequest => {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('body', 'Request must be a JSON object');
  }

  const obj = data as Record<string, unknown>;

  if (!obj.name || typeof obj.name !== 'string') {
    throw new ValidationError('name', 'Prompt name must be a non-empty string');
  }

  if (!/^[a-zA-Z0-9._-]+\.?[a-zA-Z0-9._-]*$/.test(obj.name)) {
    throw new ValidationError('name', 'Invalid prompt name format');
  }

  if (obj.arguments !== undefined && typeof obj.arguments !== 'object') {
    throw new ValidationError('arguments', 'Arguments must be an object');
  }

  return {
    name: obj.name,
    arguments: obj.arguments as Record<string, unknown>,
  };
};

/**
 * Create validation error response
 */
export const createValidationErrorResponse = (
  error: ValidationError
): Response => {
  return new Response(
    JSON.stringify({
      error: 'Validation Error',
      field: error.field,
      message: error.reason,
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};

/**
 * Safe JSON parsing with error handling
 */
export const safeJsonParse = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch (err) {
    throw new ValidationError('body', 'Invalid JSON payload');
  }
};
