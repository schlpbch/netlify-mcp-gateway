package ch.sbb.mcp.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Configuration properties for the MCP Gateway.
 */
@ConfigurationProperties(prefix = "mcp.gateway")
public class GatewayProperties {
    
    private CacheConfig cache = new CacheConfig();
    private RoutingConfig routing = new RoutingConfig();
    private HealthConfig health = new HealthConfig();
    private List<ServerConfig> servers = new ArrayList<>();
    
    // Getters and setters
    public CacheConfig getCache() { return cache; }
    public void setCache(CacheConfig cache) { this.cache = cache; }
    
    public RoutingConfig getRouting() { return routing; }
    public void setRouting(RoutingConfig routing) { this.routing = routing; }
    
    public HealthConfig getHealth() { return health; }
    public void setHealth(HealthConfig health) { this.health = health; }
    
    public List<ServerConfig> getServers() { return servers; }
    public void setServers(List<ServerConfig> servers) { this.servers = servers; }
    
    /**
     * Cache configuration.
     */
    public static class CacheConfig {
        private Duration defaultTtl = Duration.ofMinutes(5);
        private int maxSize = 10000;
        private String evictionStrategy = "lru";
        
        public Duration getDefaultTtl() { return defaultTtl; }
        public void setDefaultTtl(Duration defaultTtl) { this.defaultTtl = defaultTtl; }
        
        public int getMaxSize() { return maxSize; }
        public void setMaxSize(int maxSize) { this.maxSize = maxSize; }
        
        public String getEvictionStrategy() { return evictionStrategy; }
        public void setEvictionStrategy(String evictionStrategy) { this.evictionStrategy = evictionStrategy; }
    }
    
    /**
     * Routing configuration.
     */
    public static class RoutingConfig {
        private RetryConfig retry = new RetryConfig();
        private TimeoutConfig timeout = new TimeoutConfig();
        
        public RetryConfig getRetry() { return retry; }
        public void setRetry(RetryConfig retry) { this.retry = retry; }
        
        public TimeoutConfig getTimeout() { return timeout; }
        public void setTimeout(TimeoutConfig timeout) { this.timeout = timeout; }
    }
    
    /**
     * Retry configuration.
     */
    public static class RetryConfig {
        private int maxAttempts = 3;
        private Duration backoffDelay = Duration.ofSeconds(1);
        private double backoffMultiplier = 2.0;
        
        public int getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
        
        public Duration getBackoffDelay() { return backoffDelay; }
        public void setBackoffDelay(Duration backoffDelay) { this.backoffDelay = backoffDelay; }
        
        public double getBackoffMultiplier() { return backoffMultiplier; }
        public void setBackoffMultiplier(double backoffMultiplier) { this.backoffMultiplier = backoffMultiplier; }
    }
    
    /**
     * Timeout configuration.
     */
    public static class TimeoutConfig {
        private Duration connect = Duration.ofSeconds(5);
        private Duration read = Duration.ofSeconds(30);
        
        public Duration getConnect() { return connect; }
        public void setConnect(Duration connect) { this.connect = connect; }
        
        public Duration getRead() { return read; }
        public void setRead(Duration read) { this.read = read; }
    }
    
    /**
     * Health check configuration.
     */
    public static class HealthConfig {
        private Duration checkInterval = Duration.ofSeconds(60);
        private int unhealthyThreshold = 3;
        
        public Duration getCheckInterval() { return checkInterval; }
        public void setCheckInterval(Duration checkInterval) { this.checkInterval = checkInterval; }
        
        public int getUnhealthyThreshold() { return unhealthyThreshold; }
        public void setUnhealthyThreshold(int unhealthyThreshold) { this.unhealthyThreshold = unhealthyThreshold; }
    }
    
    /**
     * Server configuration.
     */
    public static class ServerConfig {
        private String id;
        private String name;
        private String endpoint;
        private String transport = "http";
        private int priority = 1;
        
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        
        public String getEndpoint() { return endpoint; }
        public void setEndpoint(String endpoint) { this.endpoint = endpoint; }
        
        public String getTransport() { return transport; }
        public void setTransport(String transport) { this.transport = transport; }
        
        public int getPriority() { return priority; }
        public void setPriority(int priority) { this.priority = priority; }
    }
}
