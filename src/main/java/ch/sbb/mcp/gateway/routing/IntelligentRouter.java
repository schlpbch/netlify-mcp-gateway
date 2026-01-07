package ch.sbb.mcp.gateway.routing;

import ch.sbb.mcp.gateway.cache.ResponseCache;
import ch.sbb.mcp.gateway.client.BackendMcpClient;
import ch.sbb.mcp.gateway.model.ServerHealth;
import ch.sbb.mcp.gateway.model.ServerRegistration;
import ch.sbb.mcp.gateway.registry.ServerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Intelligent router for MCP requests.
 * 
 * <p>Routes tool calls to appropriate backend servers with caching,
 * health-aware routing, and failover support.</p>
 */
@Service
public class IntelligentRouter {
    
    private static final Logger log = LoggerFactory.getLogger(IntelligentRouter.class);
    
    private final ServerRegistry registry;
    private final ResponseCache cache;
    private final BackendMcpClient backendClient;
    
    public IntelligentRouter(ServerRegistry registry, 
                            ResponseCache cache,
                            BackendMcpClient backendClient) {
        this.registry = registry;
        this.cache = cache;
        this.backendClient = backendClient;
    }
    
    /**
     * Route tool call with caching and failover.
     * 
     * @param toolName the namespaced tool name
     * @param arguments the tool arguments
     * @return the tool result
     */
    public Map<String, Object> routeToolCall(String toolName, Map<String, Object> arguments) {
        // 1. Check cache first
        String cacheKey = cache.generateKey("tool", toolName, arguments);
        Map<String, Object> cached = cache.get(cacheKey);
        if (cached != null) {
            log.debug("Cache hit for tool: {}", toolName);
            return cached;
        }
        
        // 2. Resolve server from registry
        ServerRegistration server = registry.resolveToolServer(toolName);
        
        // 3. Check health
        if (server.health().status() == ServerHealth.HealthStatus.DOWN) {
            log.warn("Server {} is DOWN, attempting failover", server.id());
            // TODO: Implement failover to alternative instances
            throw new RuntimeException("Server is down: " + server.id());
        }
        
        // 4. Execute tool call
        String bareToolName = stripNamespace(toolName);
        Map<String, Object> result = backendClient.callTool(server, bareToolName, arguments);
        
        // 5. Cache result
        Duration ttl = getCacheTtl(toolName);
        cache.set(cacheKey, result, ttl);
        
        log.debug("Routed tool {} to server {} (cached with TTL: {})", toolName, server.id(), ttl);
        
        return result;
    }
    
    /**
     * Route resource read request.
     * 
     * @param uri the resource URI
     * @return the resource content
     */
    public String routeResourceRead(String uri) {
        // Resources are not cached by default (could be dynamic)
        ServerRegistration server = registry.resolveResourceServer(uri);
        
        if (server.health().status() == ServerHealth.HealthStatus.DOWN) {
            log.warn("Server {} is DOWN for resource read", server.id());
            throw new RuntimeException("Server is down: " + server.id());
        }
        
        return backendClient.readResource(server, uri);
    }
    
    /**
     * Route prompt request.
     * 
     * @param promptName the namespaced prompt name
     * @param arguments the prompt arguments
     * @return the prompt result
     */
    public Map<String, Object> routePromptRequest(String promptName, Map<String, Object> arguments) {
        // Prompts are not cached (they're templates, not data)
        ServerRegistration server = registry.resolvePromptServer(promptName);
        
        if (server.health().status() == ServerHealth.HealthStatus.DOWN) {
            log.warn("Server {} is DOWN for prompt request", server.id());
            throw new RuntimeException("Server is down: " + server.id());
        }
        
        String barePromptName = stripNamespace(promptName);
        return backendClient.getPrompt(server, barePromptName, arguments);
    }
    
    /**
     * Select instance for load balancing (future multi-instance support).
     * 
     * @param candidates list of candidate servers
     * @return the selected server
     */
    public ServerRegistration selectInstance(List<ServerRegistration> candidates) {
        // Simple priority-based selection for now
        return candidates.stream()
            .filter(server -> server.health().status() == ServerHealth.HealthStatus.HEALTHY)
            .sorted(Comparator.comparingInt(ServerRegistration::priority).reversed())
            .findFirst()
            .orElseThrow(() -> new RuntimeException("No healthy servers available for failover"));
    }
    
    /**
     * Get cache TTL based on tool type.
     * 
     * @param toolName the tool name
     * @return the TTL duration
     */
    private Duration getCacheTtl(String toolName) {
        // Different TTLs for different tool types
        String lowerName = toolName.toLowerCase();
        
        if (lowerName.contains("findtrips") || lowerName.contains("searchconnections")) {
            return Duration.ofMinutes(15);
        }
        if (lowerName.contains("pricing") || lowerName.contains("price")) {
            return Duration.ofMinutes(10);
        }
        if (lowerName.contains("weather") || lowerName.contains("meteo")) {
            return Duration.ofHours(1);
        }
        if (lowerName.contains("aare") || lowerName.contains("river")) {
            return Duration.ofMinutes(30);
        }
        
        // Default TTL
        return cache.getDefaultTtl();
    }
    
    /**
     * Strip namespace from tool/prompt name.
     * 
     * @param namespacedName the namespaced name
     * @return the bare name
     */
    private String stripNamespace(String namespacedName) {
        return namespacedName.contains(".") 
            ? namespacedName.substring(namespacedName.indexOf(".") + 1)
            : namespacedName;
    }
    
    /**
     * Exception thrown when no healthy server is available.
     */
    public static class NoHealthyServerException extends RuntimeException {
        public NoHealthyServerException(String message) {
            super(message);
        }
    }
}
