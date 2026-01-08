/**
 * Monitoring & Metrics Collection
 * Collects gateway metrics for monitoring dashboard
 */

export interface RequestMetrics {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  latency: number;
  cached: boolean;
  error?: string;
}

export interface GatewayMetrics {
  totalRequests: number;
  totalErrors: number;
  cacheHitRate: number;
  averageLatency: number;
  requestsPerMinute: number;
  errorsPerMinute: number;
  uptime: number;
  backendHealth: Map<string, BackendMetrics>;
}

export interface BackendMetrics {
  serverId: string;
  serverName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  lastError?: string;
}

/**
 * Metrics Collector
 */
export class MetricsCollector {
  private startTime = Date.now();
  private requestLog: RequestMetrics[] = [];
  private backendMetrics = new Map<string, BackendMetrics>();
  private readonly maxLogSize = 1000; // Keep last 1000 requests

  /**
   * Record request metric
   */
  recordRequest(metric: RequestMetrics): void {
    this.requestLog.push(metric);

    // Keep only recent requests
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog = this.requestLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Record backend request
   */
  recordBackendRequest(
    serverId: string,
    serverName: string,
    success: boolean,
    latency: number,
    error?: string
  ): void {
    const key = serverId;
    const existing = this.backendMetrics.get(key) || {
      serverId,
      serverName,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      status: 'HEALTHY',
      lastError: undefined,
    };

    existing.totalRequests++;
    if (success) {
      existing.successfulRequests++;
    } else {
      existing.failedRequests++;
      existing.lastError = error;
    }

    // Update average latency
    existing.averageLatency =
      (existing.averageLatency * (existing.totalRequests - 1) + latency) /
      existing.totalRequests;

    // Update status based on failure rate
    const failureRate = existing.failedRequests / existing.totalRequests;
    if (failureRate > 0.5) {
      existing.status = 'DOWN';
    } else if (failureRate > 0.2) {
      existing.status = 'DEGRADED';
    } else {
      existing.status = 'HEALTHY';
    }

    this.backendMetrics.set(key, existing);
  }

  /**
   * Get current metrics
   */
  getMetrics(): GatewayMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Filter to last minute
    const recentRequests = this.requestLog.filter(
      (r) => r.timestamp > oneMinuteAgo
    );

    // Calculate metrics
    const totalRequests = this.requestLog.length;
    const totalErrors = this.requestLog.filter(
      (r) => r.statusCode >= 400
    ).length;
    const cachedRequests = this.requestLog.filter((r) => r.cached).length;
    const cacheHitRate = totalRequests > 0 ? cachedRequests / totalRequests : 0;
    const averageLatency =
      totalRequests > 0
        ? this.requestLog.reduce((sum, r) => sum + r.latency, 0) / totalRequests
        : 0;

    const recentErrors = recentRequests.filter(
      (r) => r.statusCode >= 400
    ).length;
    const errorsPerMinute = recentErrors;
    const requestsPerMinute = recentRequests.length;

    const uptime = Math.floor((now - this.startTime) / 1000); // in seconds

    return {
      totalRequests,
      totalErrors,
      cacheHitRate,
      averageLatency,
      requestsPerMinute,
      errorsPerMinute,
      uptime,
      backendHealth: this.backendMetrics,
    };
  }

  /**
   * Get metrics summary for API endpoint
   */
  getSummary() {
    const metrics = this.getMetrics();

    return {
      gateway: {
        totalRequests: metrics.totalRequests,
        totalErrors: metrics.totalErrors,
        errorRate:
          metrics.totalRequests > 0
            ? (metrics.totalErrors / metrics.totalRequests) * 100
            : 0,
        cacheHitRate: (metrics.cacheHitRate * 100).toFixed(2) + '%',
        averageLatencyMs: metrics.averageLatency.toFixed(2),
        requestsPerMinute: metrics.requestsPerMinute,
        errorsPerMinute: metrics.errorsPerMinute,
        uptimeSeconds: metrics.uptime,
      },
      backends: Array.from(metrics.backendHealth.values()).map((m) => ({
        id: m.serverId,
        name: m.serverName,
        status: m.status,
        totalRequests: m.totalRequests,
        successRate:
          m.totalRequests > 0
            ? ((m.successfulRequests / m.totalRequests) * 100).toFixed(2) + '%'
            : 'N/A',
        averageLatencyMs: m.averageLatency.toFixed(2),
        lastError: m.lastError,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.startTime = Date.now();
    this.requestLog = [];
    this.backendMetrics.clear();
  }
}

/**
 * Global metrics instance
 */
export const globalMetrics = new MetricsCollector();
