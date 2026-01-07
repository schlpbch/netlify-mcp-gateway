import type { ServerConfig, TransportType } from './types/server.ts';
import type { GatewayConfig } from './types/config.ts';
import { DEFAULT_CONFIG } from './types/config.ts';

/**
 * Load gateway configuration from environment variables
 */
export function loadConfig(): GatewayConfig {
  const servers: ServerConfig[] = [
    {
      id: 'journey-service-mcp',
      name: 'Journey Service',
      endpoint:
        Deno.env.get('JOURNEY_SERVICE_URL') ||
        'https://journey-service-mcp-staging-912808c32493.europe-west6.run.app/mcp',
      transport: 'http' as TransportType,
      priority: 1,
    },
    {
      id: 'swiss-mobility-mcp',
      name: 'Swiss Mobility',
      endpoint:
        Deno.env.get('SWISS_MOBILITY_URL') ||
        'https://swiss-mobility-mcp-staging-912808c32493.europe-west6.run.app/mcp',
      transport: 'http' as TransportType,
      priority: 2,
    },
    {
      id: 'aareguru-mcp',
      name: 'Aareguru',
      endpoint:
        Deno.env.get('AAREGURU_URL') ||
        'https://aareguru-mcp-staging-912808c32493.europe-west6.run.app/mcp',
      transport: 'http' as TransportType,
      priority: 3,
    },
    {
      id: 'open-meteo-mcp',
      name: 'Open Meteo',
      endpoint:
        Deno.env.get('OPEN_METEO_URL') ||
        'https://open-meteo-mcp-staging-912808c32493.europe-west6.run.app/mcp',
      transport: 'http' as TransportType,
      priority: 4,
    },
  ];

  return {
    ...DEFAULT_CONFIG,
    cache: {
      defaultTtl: parseInt(Deno.env.get('CACHE_TTL') || '300'),
      maxSize: parseInt(Deno.env.get('CACHE_MAX_SIZE') || '10000'),
    },
    routing: {
      retry: {
        maxAttempts: parseInt(Deno.env.get('RETRY_MAX_ATTEMPTS') || '3'),
        backoffDelay: parseInt(Deno.env.get('RETRY_BACKOFF_DELAY') || '100'),
        backoffMultiplier: parseFloat(
          Deno.env.get('RETRY_BACKOFF_MULTIPLIER') || '2.0'
        ),
        maxDelay: parseInt(Deno.env.get('RETRY_MAX_DELAY') || '2000'),
      },
      timeout: {
        connect: parseInt(Deno.env.get('TIMEOUT_CONNECT') || '5000'),
        read: parseInt(Deno.env.get('TIMEOUT_READ') || '30000'),
      },
    },
    health: {
      checkInterval: parseInt(Deno.env.get('HEALTH_CHECK_INTERVAL') || '60000'),
      unhealthyThreshold: parseInt(
        Deno.env.get('HEALTH_UNHEALTHY_THRESHOLD') || '3'
      ),
    },
    servers,
  };
}
