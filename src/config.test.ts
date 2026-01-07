import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

/**
 * Tests for configuration loading from environment variables.
 * Tests both default values and environment variable overrides.
 */

// Store original env values
const originalEnv: Record<string, string | undefined> = {};

function saveEnv(...keys: string[]): void {
  for (const key of keys) {
    originalEnv[key] = Deno.env.get(key);
  }
}

function restoreEnv(...keys: string[]): void {
  for (const key of keys) {
    if (originalEnv[key] !== undefined) {
      Deno.env.set(key, originalEnv[key]!);
    } else {
      Deno.env.delete(key);
    }
  }
}

function clearEnv(...keys: string[]): void {
  for (const key of keys) {
    Deno.env.delete(key);
  }
}

// ================== CACHE CONFIG TESTS ==================

Deno.test('Config - uses default cache TTL when env not set', async () => {
  saveEnv('CACHE_TTL');
  clearEnv('CACHE_TTL');

  try {
    // Dynamically import to get fresh config
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.cache.defaultTtl, 300); // default is 300
  } finally {
    restoreEnv('CACHE_TTL');
  }
});

Deno.test('Config - uses custom cache TTL from env', async () => {
  saveEnv('CACHE_TTL');
  Deno.env.set('CACHE_TTL', '600');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.cache.defaultTtl, 600);
  } finally {
    restoreEnv('CACHE_TTL');
  }
});

Deno.test('Config - uses default cache max size when env not set', async () => {
  saveEnv('CACHE_MAX_SIZE');
  clearEnv('CACHE_MAX_SIZE');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.cache.maxSize, 10000); // default is 10000
  } finally {
    restoreEnv('CACHE_MAX_SIZE');
  }
});

Deno.test('Config - uses custom cache max size from env', async () => {
  saveEnv('CACHE_MAX_SIZE');
  Deno.env.set('CACHE_MAX_SIZE', '50000');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.cache.maxSize, 50000);
  } finally {
    restoreEnv('CACHE_MAX_SIZE');
  }
});

// ================== RETRY CONFIG TESTS ==================

Deno.test('Config - uses default retry max attempts when env not set', async () => {
  saveEnv('RETRY_MAX_ATTEMPTS');
  clearEnv('RETRY_MAX_ATTEMPTS');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.retry.maxAttempts, 3);
  } finally {
    restoreEnv('RETRY_MAX_ATTEMPTS');
  }
});

Deno.test('Config - uses custom retry max attempts from env', async () => {
  saveEnv('RETRY_MAX_ATTEMPTS');
  Deno.env.set('RETRY_MAX_ATTEMPTS', '5');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.retry.maxAttempts, 5);
  } finally {
    restoreEnv('RETRY_MAX_ATTEMPTS');
  }
});

Deno.test('Config - uses default backoff delay when env not set', async () => {
  saveEnv('RETRY_BACKOFF_DELAY');
  clearEnv('RETRY_BACKOFF_DELAY');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.retry.backoffDelay, 100);
  } finally {
    restoreEnv('RETRY_BACKOFF_DELAY');
  }
});

Deno.test('Config - uses default backoff multiplier when env not set', async () => {
  saveEnv('RETRY_BACKOFF_MULTIPLIER');
  clearEnv('RETRY_BACKOFF_MULTIPLIER');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.retry.backoffMultiplier, 2.0);
  } finally {
    restoreEnv('RETRY_BACKOFF_MULTIPLIER');
  }
});

Deno.test('Config - uses custom backoff multiplier from env', async () => {
  saveEnv('RETRY_BACKOFF_MULTIPLIER');
  Deno.env.set('RETRY_BACKOFF_MULTIPLIER', '1.5');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.retry.backoffMultiplier, 1.5);
  } finally {
    restoreEnv('RETRY_BACKOFF_MULTIPLIER');
  }
});

Deno.test('Config - uses default max delay when env not set', async () => {
  saveEnv('RETRY_MAX_DELAY');
  clearEnv('RETRY_MAX_DELAY');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.retry.maxDelay, 2000);
  } finally {
    restoreEnv('RETRY_MAX_DELAY');
  }
});

// ================== TIMEOUT CONFIG TESTS ==================

Deno.test('Config - uses default connect timeout when env not set', async () => {
  saveEnv('TIMEOUT_CONNECT');
  clearEnv('TIMEOUT_CONNECT');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.timeout.connect, 5000);
  } finally {
    restoreEnv('TIMEOUT_CONNECT');
  }
});

Deno.test('Config - uses custom connect timeout from env', async () => {
  saveEnv('TIMEOUT_CONNECT');
  Deno.env.set('TIMEOUT_CONNECT', '10000');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.timeout.connect, 10000);
  } finally {
    restoreEnv('TIMEOUT_CONNECT');
  }
});

Deno.test('Config - uses default read timeout when env not set', async () => {
  saveEnv('TIMEOUT_READ');
  clearEnv('TIMEOUT_READ');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.timeout.read, 30000);
  } finally {
    restoreEnv('TIMEOUT_READ');
  }
});

Deno.test('Config - uses custom read timeout from env', async () => {
  saveEnv('TIMEOUT_READ');
  Deno.env.set('TIMEOUT_READ', '60000');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.routing.timeout.read, 60000);
  } finally {
    restoreEnv('TIMEOUT_READ');
  }
});

// ================== HEALTH CONFIG TESTS ==================

Deno.test('Config - uses default health check interval when env not set', async () => {
  saveEnv('HEALTH_CHECK_INTERVAL');
  clearEnv('HEALTH_CHECK_INTERVAL');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.health.checkInterval, 60000);
  } finally {
    restoreEnv('HEALTH_CHECK_INTERVAL');
  }
});

Deno.test('Config - uses custom health check interval from env', async () => {
  saveEnv('HEALTH_CHECK_INTERVAL');
  Deno.env.set('HEALTH_CHECK_INTERVAL', '30000');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.health.checkInterval, 30000);
  } finally {
    restoreEnv('HEALTH_CHECK_INTERVAL');
  }
});

Deno.test('Config - uses default unhealthy threshold when env not set', async () => {
  saveEnv('HEALTH_UNHEALTHY_THRESHOLD');
  clearEnv('HEALTH_UNHEALTHY_THRESHOLD');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.health.unhealthyThreshold, 3);
  } finally {
    restoreEnv('HEALTH_UNHEALTHY_THRESHOLD');
  }
});

Deno.test('Config - uses custom unhealthy threshold from env', async () => {
  saveEnv('HEALTH_UNHEALTHY_THRESHOLD');
  Deno.env.set('HEALTH_UNHEALTHY_THRESHOLD', '5');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.health.unhealthyThreshold, 5);
  } finally {
    restoreEnv('HEALTH_UNHEALTHY_THRESHOLD');
  }
});

// ================== SERVER CONFIG TESTS ==================

Deno.test('Config - includes four servers by default', async () => {
  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.servers.length, 4);
    assertEquals(config.servers[0].id, 'journey-service-mcp');
    assertEquals(config.servers[1].id, 'swiss-mobility-mcp');
    assertEquals(config.servers[2].id, 'aareguru-mcp');
    assertEquals(config.servers[3].id, 'open-meteo-mcp');
  } finally {
    // No cleanup needed
  }
});

Deno.test('Config - uses default journey service URL when env not set', async () => {
  saveEnv('JOURNEY_SERVICE_URL');
  clearEnv('JOURNEY_SERVICE_URL');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    const journeyServer = config.servers.find((s: { id: string }) => s.id === 'journey-service-mcp');
    assertEquals(
      journeyServer?.endpoint,
      'https://journey-service-mcp-staging-874479064416.europe-west6.run.app'
    );
  } finally {
    restoreEnv('JOURNEY_SERVICE_URL');
  }
});

Deno.test('Config - uses custom journey service URL from env', async () => {
  saveEnv('JOURNEY_SERVICE_URL');
  Deno.env.set('JOURNEY_SERVICE_URL', 'https://custom-journey.example.com/mcp');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    const journeyServer = config.servers.find((s: { id: string }) => s.id === 'journey-service-mcp');
    assertEquals(journeyServer?.endpoint, 'https://custom-journey.example.com/mcp');
  } finally {
    restoreEnv('JOURNEY_SERVICE_URL');
  }
});

Deno.test('Config - uses custom swiss mobility URL from env', async () => {
  saveEnv('SWISS_MOBILITY_URL');
  Deno.env.set('SWISS_MOBILITY_URL', 'https://custom-mobility.example.com/mcp');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    const mobilityServer = config.servers.find((s: { id: string }) => s.id === 'swiss-mobility-mcp');
    assertEquals(mobilityServer?.endpoint, 'https://custom-mobility.example.com/mcp');
  } finally {
    restoreEnv('SWISS_MOBILITY_URL');
  }
});

Deno.test('Config - uses custom aareguru URL from env', async () => {
  saveEnv('AAREGURU_URL');
  Deno.env.set('AAREGURU_URL', 'https://custom-aareguru.example.com/mcp');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    const aareServer = config.servers.find((s: { id: string }) => s.id === 'aareguru-mcp');
    assertEquals(aareServer?.endpoint, 'https://custom-aareguru.example.com/mcp');
  } finally {
    restoreEnv('AAREGURU_URL');
  }
});

Deno.test('Config - uses custom open meteo URL from env', async () => {
  saveEnv('OPEN_METEO_URL');
  Deno.env.set('OPEN_METEO_URL', 'https://custom-meteo.example.com/mcp');

  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    const meteoServer = config.servers.find((s: { id: string }) => s.id === 'open-meteo-mcp');
    assertEquals(meteoServer?.endpoint, 'https://custom-meteo.example.com/mcp');
  } finally {
    restoreEnv('OPEN_METEO_URL');
  }
});

Deno.test('Config - servers have correct transport type', async () => {
  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    for (const server of config.servers) {
      assertEquals(server.transport, 'http');
    }
  } finally {
    // No cleanup needed
  }
});

Deno.test('Config - servers have priority in order', async () => {
  try {
    const mod = await import('./config.ts?' + Date.now());
    const config = mod.loadConfig();

    assertEquals(config.servers[0].priority, 1); // journey
    assertEquals(config.servers[1].priority, 2); // mobility
    assertEquals(config.servers[2].priority, 3); // aareguru
    assertEquals(config.servers[3].priority, 4); // meteo
  } finally {
    // No cleanup needed
  }
});
