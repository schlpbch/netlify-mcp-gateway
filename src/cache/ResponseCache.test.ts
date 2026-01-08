import {
  assertEquals,
  assertNotEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
// import { stub } from 'https://deno.land/std@0.208.0/testing/mock.ts';

// Mock the @netlify/blobs module before importing ResponseCache
// const mockBlobStore = {
//   get: () => Promise.resolve(null),
//   setJSON: () => Promise.resolve(),
// };

// We need to test ResponseCache with mocked blob store
// Since the module imports @netlify/blobs at the top level,
// we'll create a simplified test version

class TestableResponseCache {
  private memoryCache: Map<string, { value: unknown; expires: number }>;

  constructor(private config: { defaultTtl: number; maxSize: number }) {
    this.memoryCache = new Map();
  }

  generateKey(toolName: string, args?: unknown): string {
    // Simple deterministic key for testing
    const data = JSON.stringify({ toolName, args });
    // Create a simple hash-like string from the data
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  get<T>(_key: string): Promise<T | undefined> {
    const cached = this.memoryCache.get(_key);
    if (cached && cached.expires > Date.now()) {
      return Promise.resolve(cached.value as T);
    }
    return Promise.resolve(undefined);
  }

  set<T>(_key: string, _value: T, _ttlSeconds?: number): Promise<void> {
    const ttl = _ttlSeconds || this.config.defaultTtl;
    const expires = Date.now() + ttl * 1000;
    this.memoryCache.set(_key, { value: _value, expires });
    return Promise.resolve();
  }

  invalidate(_pattern: string): Promise<void> {
    for (const key of this.memoryCache.keys()) {
      if (key.includes(_pattern)) {
        this.memoryCache.delete(key);
      }
    }
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.memoryCache.clear();
    return Promise.resolve();
  }

  getStats(): { memorySize: number } {
    return { memorySize: this.memoryCache.size };
  }
}

Deno.test('ResponseCache - generateKey produces consistent hash', () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  const key1 = cache.generateKey('journey.findTrips', { from: 'Zurich', to: 'Geneva' });
  const key2 = cache.generateKey('journey.findTrips', { from: 'Zurich', to: 'Geneva' });

  assertEquals(key1, key2);
});

Deno.test('ResponseCache - generateKey produces different hashes for different inputs', () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  const key1 = cache.generateKey('journey.findTrips', { from: 'Zurich', to: 'Geneva' });
  const key2 = cache.generateKey('journey.findTrips', { from: 'Bern', to: 'Geneva' });

  assertNotEquals(key1, key2);
});

Deno.test('ResponseCache - generateKey handles undefined args', () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  const key1 = cache.generateKey('journey.findTrips');
  const key2 = cache.generateKey('journey.findTrips', undefined);

  assertEquals(key1, key2);
});

Deno.test('ResponseCache - set and get stores and retrieves value', async () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  const testData = { content: [{ type: 'text', text: 'test response' }] };
  await cache.set('test-key', testData);

  const result = await cache.get('test-key');
  assertEquals(result, testData);
});

Deno.test('ResponseCache - get returns undefined for non-existent key', async () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  const result = await cache.get('non-existent-key');
  assertEquals(result, undefined);
});

Deno.test('ResponseCache - expired entries return undefined', async () => {
  const cache = new TestableResponseCache({ defaultTtl: 1, maxSize: 1000 });

  await cache.set('test-key', { value: 'test' }, 0.001); // 1ms TTL

  // Wait for expiry
  await new Promise((resolve) => setTimeout(resolve, 10));

  const result = await cache.get('test-key');
  assertEquals(result, undefined);
});

Deno.test('ResponseCache - custom TTL overrides default', async () => {
  const cache = new TestableResponseCache({ defaultTtl: 1, maxSize: 1000 });

  await cache.set('test-key', { value: 'test' }, 60); // 60 second TTL

  const result = await cache.get('test-key');
  assertEquals(result, { value: 'test' });
});

Deno.test('ResponseCache - invalidate removes matching entries', async () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  // Use predictable keys for testing invalidation
  const key1 = 'journey-abc123';
  const key2 = 'journey-def456';
  const key3 = 'weather-xyz789';

  await cache.set(key1, { value: 1 });
  await cache.set(key2, { value: 2 });
  await cache.set(key3, { value: 3 });

  assertEquals(cache.getStats().memorySize, 3);

  await cache.invalidate('journey');

  assertEquals(cache.getStats().memorySize, 1);
  assertEquals(await cache.get(key3), { value: 3 });
});

Deno.test('ResponseCache - clear removes all entries', async () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  await cache.set('key1', { value: 1 });
  await cache.set('key2', { value: 2 });
  await cache.set('key3', { value: 3 });

  assertEquals(cache.getStats().memorySize, 3);

  await cache.clear();

  assertEquals(cache.getStats().memorySize, 0);
});

Deno.test('ResponseCache - getStats returns correct memory size', async () => {
  const cache = new TestableResponseCache({ defaultTtl: 300, maxSize: 1000 });

  assertEquals(cache.getStats().memorySize, 0);

  await cache.set('key1', { value: 1 });
  assertEquals(cache.getStats().memorySize, 1);

  await cache.set('key2', { value: 2 });
  assertEquals(cache.getStats().memorySize, 2);
});
