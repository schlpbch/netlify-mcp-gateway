package ch.sbb.mcp.gateway.client;

import ch.sbb.mcp.gateway.model.ServerHealth;
import ch.sbb.mcp.gateway.model.ServerRegistration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * HTTP client for communicating with backend MCP servers.
 * 
 * <p>Provides methods for calling tools, reading resources, getting prompts,
 * and checking server health. All operations include retry logic.</p>
 */
@Service
public class BackendMcpClient {
    
    private static final Logger log = LoggerFactory.getLogger(BackendMcpClient.class);
    
    private final RestTemplate restTemplate;
    private final RetryTemplate retryTemplate;
    
    public BackendMcpClient(RestTemplate restTemplate, RetryTemplate retryTemplate) {
        this.restTemplate = restTemplate;
        this.retryTemplate = retryTemplate;
    }
    
    /**
     * Call a tool on a backend server.
     * 
     * @param server the server registration
     * @param toolName the tool name (without namespace)
     * @param arguments the tool arguments
     * @return the tool result
     */
    public Map<String, Object> callTool(ServerRegistration server, String toolName, Map<String, Object> arguments) {
        return retryTemplate.execute(context -> {
            String url = server.endpoint() + "/tools/call";
            
            Map<String, Object> request = Map.of(
                "name", toolName,
                "arguments", arguments
            );
            
            log.debug("Calling tool {} on server {} at {}", toolName, server.id(), url);
            
            ResponseEntity<Map> response = restTemplate.postForEntity(url, request, Map.class);
            
            @SuppressWarnings("unchecked")
            Map<String, Object> result = response.getBody();
            
            return result;
        });
    }
    
    /**
     * Read a resource from a backend server.
     * 
     * @param server the server registration
     * @param uri the resource URI
     * @return the resource content
     */
    public String readResource(ServerRegistration server, String uri) {
        return retryTemplate.execute(context -> {
            String url = server.endpoint() + "/resources/read";
            
            Map<String, Object> request = Map.of("uri", uri);
            
            log.debug("Reading resource {} from server {} at {}", uri, server.id(), url);
            
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);
            
            return response.getBody();
        });
    }
    
    /**
     * Get a prompt from a backend server.
     * 
     * @param server the server registration
     * @param promptName the prompt name (without namespace)
     * @param arguments the prompt arguments
     * @return the prompt result
     */
    public Map<String, Object> getPrompt(ServerRegistration server, String promptName, Map<String, Object> arguments) {
        return retryTemplate.execute(context -> {
            String url = server.endpoint() + "/prompts/get";
            
            Map<String, Object> request = Map.of(
                "name", promptName,
                "arguments", arguments != null ? arguments : Map.of()
            );
            
            log.debug("Getting prompt {} from server {} at {}", promptName, server.id(), url);
            
            ResponseEntity<Map> response = restTemplate.postForEntity(url, request, Map.class);
            
            @SuppressWarnings("unchecked")
            Map<String, Object> result = response.getBody();
            
            return result;
        });
    }
    
    /**
     * Check the health of a backend server.
     * 
     * @param server the server registration
     * @return the health status
     */
    public ServerHealth checkHealth(ServerRegistration server) {
        try {
            Instant start = Instant.now();
            String url = server.endpoint() + "/actuator/health";
            
            log.debug("Checking health of server {} at {}", server.id(), url);
            
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            Duration latency = Duration.between(start, Instant.now());
            
            boolean isHealthy = response.getStatusCode().is2xxSuccessful();
            
            return ServerHealth.builder()
                .status(isHealthy ? ServerHealth.HealthStatus.HEALTHY : ServerHealth.HealthStatus.DEGRADED)
                .lastCheck(Instant.now())
                .latency(latency)
                .consecutiveFailures(0)
                .build();
                
        } catch (Exception e) {
            log.warn("Health check failed for server {}: {}", server.id(), e.getMessage());
            
            int consecutiveFailures = server.health().consecutiveFailures() + 1;
            
            return ServerHealth.builder()
                .status(ServerHealth.HealthStatus.DOWN)
                .lastCheck(Instant.now())
                .errorMessage(e.getMessage())
                .consecutiveFailures(consecutiveFailures)
                .build();
        }
    }
    
    /**
     * List tools from a backend server.
     * 
     * @param server the server registration
     * @return list of tools
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listTools(ServerRegistration server) {
        try {
            String url = server.endpoint() + "/tools/list";
            
            log.debug("Listing tools from server {} at {}", server.id(), url);
            
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.postForEntity(url, Map.of(), Map.class);
            
            return response.getBody();
        } catch (Exception e) {
            log.error("Failed to list tools from server {}: {}", server.id(), e.getMessage());
            return Map.of("tools", java.util.List.of());
        }
    }
    
    /**
     * List resources from a backend server.
     * 
     * @param server the server registration
     * @return list of resources
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listResources(ServerRegistration server) {
        try {
            String url = server.endpoint() + "/resources/list";
            
            log.debug("Listing resources from server {} at {}", server.id(), url);
            
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.postForEntity(url, Map.of(), Map.class);
            
            return response.getBody();
        } catch (Exception e) {
            log.error("Failed to list resources from server {}: {}", server.id(), e.getMessage());
            return Map.of("resources", java.util.List.of());
        }
    }
    
    /**
     * List prompts from a backend server.
     * 
     * @param server the server registration
     * @return list of prompts
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listPrompts(ServerRegistration server) {
        try {
            String url = server.endpoint() + "/prompts/list";
            
            log.debug("Listing prompts from server {} at {}", server.id(), url);
            
            @SuppressWarnings("rawtypes")
            ResponseEntity<Map> response = restTemplate.postForEntity(url, Map.of(), Map.class);
            
            return response.getBody();
        } catch (Exception e) {
            log.error("Failed to list prompts from server {}: {}", server.id(), e.getMessage());
            return Map.of("prompts", java.util.List.of());
        }
    }
}
