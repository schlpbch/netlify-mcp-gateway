package ch.sbb.mcp.gateway.registry;

import ch.sbb.mcp.gateway.client.BackendMcpClient;
import ch.sbb.mcp.gateway.config.GatewayProperties;
import ch.sbb.mcp.gateway.model.ServerHealth;
import ch.sbb.mcp.gateway.model.ServerRegistration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduled health monitor for backend MCP servers.
 * 
 * <p>Periodically checks the health of all registered servers and updates
 * their health status in the registry.</p>
 */
@Component
public class ServerHealthMonitor {
    
    private static final Logger log = LoggerFactory.getLogger(ServerHealthMonitor.class);
    
    private final ServerRegistry registry;
    private final BackendMcpClient backendClient;
    private final GatewayProperties properties;
    
    public ServerHealthMonitor(ServerRegistry registry, 
                              BackendMcpClient backendClient,
                              GatewayProperties properties) {
        this.registry = registry;
        this.backendClient = backendClient;
        this.properties = properties;
    }
    
    /**
     * Scheduled health check for all registered servers.
     * 
     * <p>Runs at a fixed rate configured in application.yml (default: 60s).</p>
     */
    @Scheduled(fixedRateString = "#{@gatewayProperties.health.checkInterval.toMillis()}")
    public void checkAllServers() {
        log.debug("Starting health check for all servers");
        
        for (ServerRegistration server : registry.listServers()) {
            try {
                checkServer(server);
            } catch (Exception e) {
                log.error("Error checking health of server {}: {}", server.id(), e.getMessage());
            }
        }
    }
    
    /**
     * Check health of a single server.
     * 
     * @param server the server to check
     */
    private void checkServer(ServerRegistration server) {
        ServerHealth health = backendClient.checkHealth(server);
        
        // Check if server crossed unhealthy threshold
        int threshold = properties.getHealth().getUnhealthyThreshold();
        if (health.consecutiveFailures() >= threshold && health.status() != ServerHealth.HealthStatus.DOWN) {
            // Create new ServerHealth with DOWN status (records are immutable)
            health = ServerHealth.builder()
                .status(ServerHealth.HealthStatus.DOWN)
                .lastCheck(health.lastCheck())
                .latency(health.latency())
                .errorMessage(health.errorMessage())
                .consecutiveFailures(health.consecutiveFailures())
                .build();
            log.warn("Server {} marked as DOWN after {} consecutive failures", 
                server.id(), health.consecutiveFailures());
        }
        
        // Update registry
        registry.updateHealth(server.id(), health);
        
        // Log status changes
        if (server.health().status() != health.status()) {
            log.info("Server {} health changed from {} to {}", 
                server.id(), server.health().status(), health.status());
        }
    }
    
    /**
     * Manually trigger health check for a specific server.
     * 
     * @param serverId the server ID
     */
    public void checkServer(String serverId) {
        ServerRegistration server = registry.getServer(serverId);
        if (server != null) {
            checkServer(server);
        } else {
            log.warn("Cannot check health: server not found: {}", serverId);
        }
    }
}
