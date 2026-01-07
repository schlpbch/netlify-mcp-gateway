package ch.sbb.mcp.gateway.model;

import java.time.Instant;
import java.util.List;

/**
 * Represents a registered backend MCP server.
 * 
 * <p>Immutable record containing server metadata, capabilities, health status,
 * and registration information.</p>
 */
public record ServerRegistration(
    String id,
    String name,
    String endpoint,
    TransportType transport,
    ServerCapabilities capabilities,
    ServerHealth health,
    int priority,
    Instant registeredAt
) {
    
    /**
     * Transport type for MCP communication.
     */
    public enum TransportType {
        HTTP,
        STDIO
    }
    
    /**
     * Builder-style constructor with defaults.
     */
    public static Builder builder() {
        return new Builder();
    }
    
    public static class Builder {
        private String id;
        private String name;
        private String endpoint;
        private TransportType transport = TransportType.HTTP;
        private ServerCapabilities capabilities = new ServerCapabilities();
        private ServerHealth health = ServerHealth.unknown();
        private int priority = 1;
        private Instant registeredAt = Instant.now();
        
        public Builder id(String id) {
            this.id = id;
            return this;
        }
        
        public Builder name(String name) {
            this.name = name;
            return this;
        }
        
        public Builder endpoint(String endpoint) {
            this.endpoint = endpoint;
            return this;
        }
        
        public Builder transport(TransportType transport) {
            this.transport = transport;
            return this;
        }
        
        public Builder capabilities(ServerCapabilities capabilities) {
            this.capabilities = capabilities;
            return this;
        }
        
        public Builder health(ServerHealth health) {
            this.health = health;
            return this;
        }
        
        public Builder priority(int priority) {
            this.priority = priority;
            return this;
        }
        
        public Builder registeredAt(Instant registeredAt) {
            this.registeredAt = registeredAt;
            return this;
        }
        
        public ServerRegistration build() {
            return new ServerRegistration(id, name, endpoint, transport, capabilities, health, priority, registeredAt);
        }
    }
}
