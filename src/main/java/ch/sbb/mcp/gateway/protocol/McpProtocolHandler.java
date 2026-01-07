package ch.sbb.mcp.gateway.protocol;

import ch.sbb.mcp.gateway.client.BackendMcpClient;
import ch.sbb.mcp.gateway.model.ServerRegistration;
import ch.sbb.mcp.gateway.registry.ServerRegistry;
import ch.sbb.mcp.gateway.routing.IntelligentRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * MCP protocol handler for the gateway.
 * 
 * <p>Implements the MCP protocol by aggregating capabilities from all backend servers
 * and routing requests to the appropriate server. Handles namespace prefixing for
 * tools and prompts to avoid naming conflicts.</p>
 */
@Service
public class McpProtocolHandler {
    
    private static final Logger log = LoggerFactory.getLogger(McpProtocolHandler.class);
    
    private final ServerRegistry serverRegistry;
    private final IntelligentRouter router;
    private final BackendMcpClient backendClient;
    
    public McpProtocolHandler(ServerRegistry serverRegistry, 
                             IntelligentRouter router,
                             BackendMcpClient backendClient) {
        this.serverRegistry = serverRegistry;
        this.router = router;
        this.backendClient = backendClient;
    }
    
    /**
     * List all tools from all healthy servers.
     * 
     * <p>Aggregates tools from all servers and adds namespace prefixes to avoid conflicts.</p>
     * 
     * @return map containing list of tools
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listTools() {
        List<Map<String, Object>> allTools = new ArrayList<>();
        
        for (ServerRegistration server : serverRegistry.getHealthyServers()) {
            try {
                Map<String, Object> response = backendClient.listTools(server);
                List<Map<String, Object>> tools = (List<Map<String, Object>>) response.get("tools");
                
                if (tools != null) {
                    for (Map<String, Object> tool : tools) {
                        Map<String, Object> prefixedTool = new HashMap<>(tool);
                        String originalName = (String) tool.get("name");
                        String prefixedName = addNamespacePrefix(server, originalName);
                        prefixedTool.put("name", prefixedName);
                        
                        // Add server metadata
                        prefixedTool.put("_serverId", server.id());
                        prefixedTool.put("_serverName", server.name());
                        
                        allTools.add(prefixedTool);
                    }
                }
            } catch (Exception e) {
                log.error("Failed to list tools from server {}: {}", server.id(), e.getMessage());
            }
        }
        
        log.info("Listed {} tools from {} healthy servers", allTools.size(), serverRegistry.getHealthyServers().size());
        
        return Map.of("tools", allTools);
    }
    
    /**
     * Call a tool on the appropriate backend server.
     * 
     * @param toolName the namespaced tool name
     * @param arguments the tool arguments
     * @return the tool result
     */
    public Map<String, Object> callTool(String toolName, Map<String, Object> arguments) {
        log.info("Calling tool: {} with arguments: {}", toolName, arguments);
        return router.routeToolCall(toolName, arguments);
    }
    
    /**
     * List all resources from all healthy servers.
     * 
     * @return map containing list of resources
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listResources() {
        List<Map<String, Object>> allResources = new ArrayList<>();
        
        for (ServerRegistration server : serverRegistry.getHealthyServers()) {
            try {
                Map<String, Object> response = backendClient.listResources(server);
                List<Map<String, Object>> resources = (List<Map<String, Object>>) response.get("resources");
                
                if (resources != null) {
                    for (Map<String, Object> resource : resources) {
                        Map<String, Object> enrichedResource = new HashMap<>(resource);
                        
                        // Add server metadata
                        enrichedResource.put("_serverId", server.id());
                        enrichedResource.put("_serverName", server.name());
                        
                        allResources.add(enrichedResource);
                    }
                }
            } catch (Exception e) {
                log.error("Failed to list resources from server {}: {}", server.id(), e.getMessage());
            }
        }
        
        log.info("Listed {} resources from {} healthy servers", allResources.size(), serverRegistry.getHealthyServers().size());
        
        return Map.of("resources", allResources);
    }
    
    /**
     * Read a resource from the appropriate backend server.
     * 
     * @param uri the resource URI
     * @return the resource content
     */
    public String readResource(String uri) {
        log.info("Reading resource: {}", uri);
        return router.routeResourceRead(uri);
    }
    
    /**
     * List all prompts from all healthy servers.
     * 
     * @return map containing list of prompts
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listPrompts() {
        List<Map<String, Object>> allPrompts = new ArrayList<>();
        
        for (ServerRegistration server : serverRegistry.getHealthyServers()) {
            try {
                Map<String, Object> response = backendClient.listPrompts(server);
                List<Map<String, Object>> prompts = (List<Map<String, Object>>) response.get("prompts");
                
                if (prompts != null) {
                    for (Map<String, Object> prompt : prompts) {
                        Map<String, Object> prefixedPrompt = new HashMap<>(prompt);
                        String originalName = (String) prompt.get("name");
                        String prefixedName = addNamespacePrefix(server, originalName);
                        prefixedPrompt.put("name", prefixedName);
                        
                        // Add server metadata
                        prefixedPrompt.put("_serverId", server.id());
                        prefixedPrompt.put("_serverName", server.name());
                        
                        allPrompts.add(prefixedPrompt);
                    }
                }
            } catch (Exception e) {
                log.error("Failed to list prompts from server {}: {}", server.id(), e.getMessage());
            }
        }
        
        log.info("Listed {} prompts from {} healthy servers", allPrompts.size(), serverRegistry.getHealthyServers().size());
        
        return Map.of("prompts", allPrompts);
    }
    
    /**
     * Get a prompt from the appropriate backend server.
     * 
     * @param promptName the namespaced prompt name
     * @param arguments the prompt arguments
     * @return the prompt result
     */
    public Map<String, Object> getPrompt(String promptName, Map<String, Object> arguments) {
        log.info("Getting prompt: {} with arguments: {}", promptName, arguments);
        return router.routePromptRequest(promptName, arguments);
    }
    
    /**
     * Add namespace prefix to tool/prompt name.
     * 
     * @param server the server
     * @param name the original name
     * @return the prefixed name
     */
    private String addNamespacePrefix(ServerRegistration server, String name) {
        String prefix = getServerPrefix(server.id());
        return prefix + "." + name;
    }
    
    /**
     * Get short prefix for server ID.
     * 
     * @param serverId the server ID
     * @return the short prefix
     */
    private String getServerPrefix(String serverId) {
        return switch (serverId) {
            case "journey-service-mcp" -> "journey";
            case "swiss-mobility-mcp" -> "mobility";
            case "aareguru-mcp" -> "aareguru";
            case "open-meteo-mcp" -> "meteo";
            default -> serverId.replace("-mcp", "");
        };
    }
}
