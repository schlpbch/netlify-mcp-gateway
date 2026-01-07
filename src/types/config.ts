// Gateway Configuration Types

export interface CacheConfig {
  defaultTtl: number; // seconds
  maxSize: number;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffDelay: number; // milliseconds
  backoffMultiplier: number;
  maxDelay: number; // milliseconds
}

export interface TimeoutConfig {
  connect: number; // milliseconds
  read: number; // milliseconds
}

export interface RoutingConfig {
  retry: RetryConfig;
  timeout: TimeoutConfig;
}

export interface HealthConfig {
  checkInterval: number; // milliseconds
  unhealthyThreshold: number;
}

export interface GatewayConfig {
  cache: CacheConfig;
  routing: RoutingConfig;
  health: HealthConfig;
  servers: import('./server.ts').ServerConfig[];
}

// Environment variable defaults
export const DEFAULT_CONFIG: Omit<GatewayConfig, 'servers'> = {
  cache: {
    defaultTtl: 300, // 5 minutes
    maxSize: 10000,
  },
  routing: {
    retry: {
      maxAttempts: 3,
      backoffDelay: 100,
      backoffMultiplier: 2.0,
      maxDelay: 2000,
    },
    timeout: {
      connect: 5000,
      read: 30000,
    },
  },
  health: {
    checkInterval: 60000, // 60 seconds
    unhealthyThreshold: 3,
  },
};
