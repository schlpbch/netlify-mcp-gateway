/**
 * Rate Limiter Middleware
 * Implements per-IP rate limiting with configurable limits
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (request: Request) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: 60 * 1000, // Default: 1 minute
      maxRequests: 100, // Default: 100 requests per minute
      ...config,
    };

    // Cleanup old entries every 5 minutes
    this.startCleanup();
  }

  /**
   * Check if request is within rate limit
   */
  isAllowed(request: Request): boolean {
    const key = this.getKey(request);
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // Create new entry
      this.store.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return true;
    }

    // Check if within limit
    if (entry.count < this.config.maxRequests) {
      entry.count++;
      return true;
    }

    return false;
  }

  /**
   * Get remaining requests for an IP
   */
  getRemaining(request: Request): number {
    const key = this.getKey(request);
    const entry = this.store.get(key);

    if (!entry || Date.now() > entry.resetTime) {
      return this.config.maxRequests;
    }

    return Math.max(0, this.config.maxRequests - entry.count);
  }

  /**
   * Get reset time for an IP
   */
  getResetTime(request: Request): number {
    const key = this.getKey(request);
    const entry = this.store.get(key);

    if (!entry) {
      return Date.now() + this.config.windowMs;
    }

    return entry.resetTime;
  }

  /**
   * Generate rate limit key from request
   */
  private getKey(request: Request): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(request);
    }

    // Default: use client IP from CF-Connecting-IP or X-Forwarded-For
    const cfConnectingIp = request.headers.get('CF-Connecting-IP');
    const xForwardedFor = request.headers.get('X-Forwarded-For');

    return cfConnectingIp || xForwardedFor?.split(',')[0] || 'unknown';
  }

  /**
   * Start cleanup of expired entries
   */
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.resetTime) {
          this.store.delete(key);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Create middleware response for rate limit exceeded
   */
  static createResponse(resetTime: number): Response {
    return new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
          'X-RateLimit-Reset': new Date(resetTime).toISOString(),
        },
      }
    );
  }
}

/**
 * Create rate limiter middleware
 */
export const createRateLimitMiddleware = (
  config?: Partial<RateLimitConfig>
) => {
  const limiter = new RateLimiter({
    windowMs: config?.windowMs || 60 * 1000, // 1 minute
    maxRequests: config?.maxRequests || 100, // 100 requests per minute
    keyGenerator: config?.keyGenerator,
  });

  return (handler: (request: Request) => Promise<Response>) => {
    return async (request: Request): Promise<Response> => {
      if (!limiter.isAllowed(request)) {
        return RateLimiter.createResponse(limiter.getResetTime(request));
      }

      const response = await handler(request);

      // Add rate limit headers to response
      const remaining = limiter.getRemaining(request);
      const resetTime = limiter.getResetTime(request);

      response.headers.set(
        'X-RateLimit-Limit',
        config?.maxRequests?.toString() || '100'
      );
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set(
        'X-RateLimit-Reset',
        new Date(resetTime).toISOString()
      );

      return response;
    };
  };
};
