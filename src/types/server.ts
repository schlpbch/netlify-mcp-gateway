// Server Health Types
export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  DOWN = 'DOWN',
  UNKNOWN = 'UNKNOWN',
}

export interface ServerHealth {
  status: HealthStatus;
  lastCheck: Date;
  latency: number; // milliseconds
  errorMessage?: string;
  consecutiveFailures: number;
}

// Server Capabilities Types
export interface ResourceCapability {
  uriPrefix: string;
  description: string;
}

export interface ServerCapabilities {
  tools: string[];
  resources: ResourceCapability[];
  prompts: string[];
}

// Transport Types
export enum TransportType {
  HTTP = 'http',
  STDIO = 'stdio',
}

// Server Registration
export interface ServerRegistration {
  id: string;
  name: string;
  endpoint: string;
  transport: TransportType;
  capabilities: ServerCapabilities;
  health: ServerHealth;
  priority: number;
  registeredAt: Date;
}

// Server Configuration (from config)
export interface ServerConfig {
  id: string;
  name: string;
  endpoint: string;
  transport: TransportType;
  priority: number;
}
