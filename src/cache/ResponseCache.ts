// Netlify Blobs is only available on Netlify Edge
// For local dev, we'll use in-memory cache only
let getStore: unknown;
try {
  const blobs = await import('@netlify/blobs');
  getStore = blobs.getStore;
} catch {
  // Running locally - Netlify Blobs not available
  getStore = null;
}

import type { CacheConfig } from '../types/config.ts';

interface CacheEntry<T> {
  value: T;
  expires: number;
}

/**
 * Response cache using Netlify Blobs for persistent edge storage
 * Falls back to memory-only cache for local development
 */
export class ResponseCache {
  private blobStore: unknown;
  private memoryCache: Map<string, CacheEntry<unknown>>;

  constructor(private config: CacheConfig) {
    this.blobStore = getStore ? getStore('mcp-cache') : null;
    this.memoryCache = new Map();
  }

  /**
   * Generate cache key from tool name and arguments
   */
  generateKey(toolName: string, args?: unknown): string {
    const data = JSON.stringify({ toolName, args });
    // Simple hash function for cache keys
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Get cached value (checks memory first, then blob storage)
   */
  async get<T>(key: string): Promise<T | undefined> {
    // Check memory cache first
    const cached = this.memoryCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value as T;
    }

    // Check blob storage (only on Netlify)
    if (this.blobStore) {
      try {
        const blob = await this.blobStore.get(key, { type: 'json' });
        if (blob) {
          const entry = blob as CacheEntry<T>;
          if (entry.expires > Date.now()) {
            // Populate memory cache
            this.memoryCache.set(key, entry);
            return entry.value;
          }
        }
      } catch (error) {
        console.warn('Cache read error:', error);
      }
    }

    return undefined;
  }

  /**
   * Set cached value (writes to both memory and blob storage)
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.config.defaultTtl;
    const expires = Date.now() + ttl * 1000;
    const entry: CacheEntry<T> = { value, expires };

    // Set in memory cache
    this.memoryCache.set(key, entry);

    // Set in blob storage (async, don't wait) - only on Netlify
    if (this.blobStore) {
      try {
        await this.blobStore.setJSON(key, entry);
      } catch (error) {
        console.warn('Cache write error:', error);
      }
    }
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidate(_pattern: string): Promise<void> {
    // Clear from memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.includes(_pattern)) {
        this.memoryCache.delete(key);
      }
    }

    // Note: Netlify Blobs doesn't support pattern-based deletion
    // We'd need to list all keys and delete individually, which is expensive
    console.log(`Invalidated memory cache for pattern: ${_pattern}`);
    return Promise.resolve();
  }

  /**
   * Clear all cache entries
   */
  clear(): Promise<void> {
    this.memoryCache.clear();
    console.log('Cleared memory cache');
    return Promise.resolve();
  }

  /**
   * Get cache statistics
   */
  getStats(): { memorySize: number } {
    return {
      memorySize: this.memoryCache.size,
    };
  }
}
