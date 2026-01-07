package ch.sbb.mcp.gateway.registry;

import ch.sbb.mcp.gateway.model.ServerHealth;
import ch.sbb.mcp.gateway.model.ServerRegistration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Registry for managing backend MCP server connections.
 * 
 * <p>Provides thread-safe registration, unregistration, and lookup of backend servers.
 * Supports resolving servers by tool name, resource URI, and prompt name.</p>
 */
@Component
public class ServerRegistry {
    
    private static final Logger log = LoggerFactory.getLogger(ServerRegistry.class);
    
    private final Map<String, ServerRegistration> servers = new ConcurrentHashMap<>();
    
    /**
     * Register a new backend server.
     * 
     * @param registration the server registration
     */
    public void register(ServerRegistration registration) {
        servers.put(registration.id(), registration);
        log.info("Registered server: {} at {}", registration.name(), registration.endpoint());
    }
    
    /**
     * Unregister a backend server.
     * 
     * @param serverId the server ID
     */
    public void unregister(String serverId) {
        ServerRegistration server = servers.remove(serverId);
        if (server != null) {
            log.info("Unregistered server: {}", server.name());
        }
    }
    
    /**
     * Get all registered servers.
     * 
     * @return list of all servers
     */
    public List<ServerRegistration> listServers() {
        return new ArrayList<>(servers.values());
    }
    
    /**
     * Get only healthy servers.
     * 
     * @return list of healthy servers
     */
    public List<ServerRegistration> getHealthyServers() {
        return servers.values().stream()
            .filter(server -> server.health().status() == ServerHealth.HealthStatus.HEALTHY)
            .toList();
    }
    
    /**
     * Get a server by ID.
     * 
     * @param serverId the server ID
     * @return the server registration, or null if not found
     */
    public ServerRegistration getServer(String serverId) {
        return servers.get(serverId);
    }
    
    /**
     * Resolve server by tool name (namespace-aware).
     * 
     * <p>Tool names are expected to be prefixed with the server ID (e.g., "journey.findTrips").
     * This method extracts the server ID from the prefix and looks up the server.</p>
     * 
     * @param toolName the namespaced tool name
     * @return the server registration
     * @throws ServerNotFoundException if no server is found
     */
    public ServerRegistration resolveToolServer(String toolName) {
        String serverId = extractServerId(toolName);
        
        ServerRegistration server = servers.get(serverId);
        if (server == null) {
            throw new ServerNotFoundException("No server found for tool: " + toolName);
        }
        
        // Verify the server actually provides this tool
        String bareToolName = stripNamespace(toolName);
        if (!server.capabilities().tools().contains(bareToolName)) {
            throw new ServerNotFoundException("Server " + serverId + " does not provide tool: " + bareToolName);
        }
        
        return server;
    }
    
    /**
     * Resolve server by resource URI.
     * 
     * @param uri the resource URI
     * @return the server registration
     * @throws ServerNotFoundException if no server is found
     */
    public ServerRegistration resolveResourceServer(String uri) {
        return servers.values().stream()
            .filter(server -> server.capabilities().resources().stream()
                .anyMatch(resource -> uri.startsWith(resource.uriPrefix())))
            .findFirst()
            .orElseThrow(() -> new ServerNotFoundException("No server found for resource: " + uri));
    }
    
    /**
     * Resolve server by prompt name (namespace-aware).
     * 
     * @param promptName the namespaced prompt name
     * @return the server registration
     * @throws ServerNotFoundException if no server is found
     */
    public ServerRegistration resolvePromptServer(String promptName) {
        String serverId = extractServerId(promptName);
        
        ServerRegistration server = servers.get(serverId);
        if (server == null) {
            throw new ServerNotFoundException("No server found for prompt: " + promptName);
        }
        
        // Verify the server actually provides this prompt
        String barePromptName = stripNamespace(promptName);
        if (!server.capabilities().prompts().contains(barePromptName)) {
            throw new ServerNotFoundException("Server " + serverId + " does not provide prompt: " + barePromptName);
        }
        
        return server;
    }
    
    /**
     * Update the health status of a server.
     * 
     * @param serverId the server ID
     * @param health the new health status
     */
    public void updateHealth(String serverId, ServerHealth health) {
        ServerRegistration server = servers.get(serverId);
        if (server != null) {
            // Create new ServerRegistration with updated health (records are immutable)
            ServerRegistration updated = new ServerRegistration(
                server.id(),
                server.name(),
                server.endpoint(),
                server.transport(),
                server.capabilities(),
                health,
                server.priority(),
                server.registeredAt()
            );
            servers.put(serverId, updated);
            log.debug("Updated health for server {}: {}", serverId, health.status());
        }
    }
    
    /**
     * Extract server ID from namespaced name.
     * 
     * @param namespacedName the namespaced name (e.g., "journey.findTrips")
     * @return the server ID (e.g., "journey-service-mcp")
     */
    private String extractServerId(String namespacedName) {
        if (!namespacedName.contains(".")) {
            throw new IllegalArgumentException("Tool/prompt name must be namespaced: " + namespacedName);
        }
        
        String prefix = namespacedName.substring(0, namespacedName.indexOf("."));
        
        // Map short prefix to full server ID
        return switch (prefix) {
            case "journey" -> "journey-service-mcp";
            case "mobility" -> "swiss-mobility-mcp";
            case "aareguru" -> "aareguru-mcp";
            case "meteo", "weather" -> "open-meteo-mcp";
            default -> prefix + "-mcp"; // Fallback pattern
        };
    }
    
    /**
     * Strip namespace from tool/prompt name.
     * 
     * @param namespacedName the namespaced name (e.g., "journey.findTrips")
     * @return the bare name (e.g., "findTrips")
     */
    private String stripNamespace(String namespacedName) {
        return namespacedName.contains(".") 
            ? namespacedName.substring(namespacedName.indexOf(".") + 1)
            : namespacedName;
    }
    
    /**
     * Exception thrown when a server cannot be found.
     */
    public static class ServerNotFoundException extends RuntimeException {
        public ServerNotFoundException(String message) {
            super(message);
        }
    }
}
