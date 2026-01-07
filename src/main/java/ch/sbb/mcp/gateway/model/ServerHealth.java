package ch.sbb.mcp.gateway.model;

import java.time.Duration;
import java.time.Instant;

/**
 * Represents the health status of a backend MCP server.
 * 
 * <p>Immutable record tracking health check results and failure counts.</p>
 */
public record ServerHealth(
    HealthStatus status,
    Instant lastCheck,
    Duration latency,
    String errorMessage,
    int consecutiveFailures
) {
    
    /**
     * Health status enumeration.
     */
    public enum HealthStatus {
        HEALTHY,
        DEGRADED,
        DOWN,
        UNKNOWN
    }
    
    /**
     * Create an unknown health status.
     */
    public static ServerHealth unknown() {
        return new ServerHealth(HealthStatus.UNKNOWN, Instant.now(), null, null, 0);
    }
    
    /**
     * Builder-style constructor.
     */
    public static Builder builder() {
        return new Builder();
    }
    
    public static class Builder {
        private HealthStatus status = HealthStatus.UNKNOWN;
        private Instant lastCheck = Instant.now();
        private Duration latency;
        private String errorMessage;
        private int consecutiveFailures = 0;
        
        public Builder status(HealthStatus status) {
            this.status = status;
            return this;
        }
        
        public Builder lastCheck(Instant lastCheck) {
            this.lastCheck = lastCheck;
            return this;
        }
        
        public Builder latency(Duration latency) {
            this.latency = latency;
            return this;
        }
        
        public Builder errorMessage(String errorMessage) {
            this.errorMessage = errorMessage;
            return this;
        }
        
        public Builder consecutiveFailures(int consecutiveFailures) {
            this.consecutiveFailures = consecutiveFailures;
            return this;
        }
        
        public ServerHealth build() {
            return new ServerHealth(status, lastCheck, latency, errorMessage, consecutiveFailures);
        }
    }
    
    /**
     * Create a new ServerHealth with updated status.
     */
    public ServerHealth withStatus(HealthStatus newStatus) {
        return new ServerHealth(newStatus, lastCheck, latency, errorMessage, consecutiveFailures);
    }
}
