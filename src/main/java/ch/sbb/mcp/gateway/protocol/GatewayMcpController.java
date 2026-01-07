package ch.sbb.mcp.gateway.protocol;

import ch.sbb.mcp.gateway.protocol.McpProtocolHandler;
import ch.sbb.mcp.gateway.registry.ServerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * REST controller for MCP protocol endpoints.
 * 
 * <p>Exposes HTTP endpoints for MCP operations: tools, resources, and prompts.</p>
 */
@RestController
@RequestMapping("/mcp")
public class GatewayMcpController {
    
    private static final Logger log = LoggerFactory.getLogger(GatewayMcpController.class);
    
    private final McpProtocolHandler protocolHandler;
    
    public GatewayMcpController(McpProtocolHandler protocolHandler) {
        this.protocolHandler = protocolHandler;
    }
    
    /**
     * List all available tools.
     * 
     * @return list of tools from all servers
     */
    @PostMapping("/tools/list")
    public ResponseEntity<Map<String, Object>> listTools() {
        try {
            Map<String, Object> result = protocolHandler.listTools();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error listing tools: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Call a tool.
     * 
     * @param request the tool call request
     * @return the tool result
     */
    @PostMapping("/tools/call")
    public ResponseEntity<Map<String, Object>> callTool(@RequestBody Map<String, Object> request) {
        try {
            String toolName = (String) request.get("name");
            @SuppressWarnings("unchecked")
            Map<String, Object> arguments = (Map<String, Object>) request.get("arguments");
            
            if (toolName == null) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Missing required field: name"));
            }
            
            Map<String, Object> result = protocolHandler.callTool(toolName, arguments != null ? arguments : Map.of());
            return ResponseEntity.ok(result);
        } catch (ServerRegistry.ServerNotFoundException e) {
            log.error("Server not found: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error calling tool: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * List all available resources.
     * 
     * @return list of resources from all servers
     */
    @PostMapping("/resources/list")
    public ResponseEntity<Map<String, Object>> listResources() {
        try {
            Map<String, Object> result = protocolHandler.listResources();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error listing resources: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Read a resource.
     * 
     * @param request the resource read request
     * @return the resource content
     */
    @PostMapping("/resources/read")
    public ResponseEntity<Map<String, Object>> readResource(@RequestBody Map<String, Object> request) {
        try {
            String uri = (String) request.get("uri");
            
            if (uri == null) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Missing required field: uri"));
            }
            
            String content = protocolHandler.readResource(uri);
            return ResponseEntity.ok(Map.of("content", content));
        } catch (ServerRegistry.ServerNotFoundException e) {
            log.error("Server not found: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error reading resource: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * List all available prompts.
     * 
     * @return list of prompts from all servers
     */
    @PostMapping("/prompts/list")
    public ResponseEntity<Map<String, Object>> listPrompts() {
        try {
            Map<String, Object> result = protocolHandler.listPrompts();
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.error("Error listing prompts: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }
    
    /**
     * Get a prompt.
     * 
     * @param request the prompt request
     * @return the prompt result
     */
    @PostMapping("/prompts/get")
    public ResponseEntity<Map<String, Object>> getPrompt(@RequestBody Map<String, Object> request) {
        try {
            String promptName = (String) request.get("name");
            @SuppressWarnings("unchecked")
            Map<String, Object> arguments = (Map<String, Object>) request.get("arguments");
            
            if (promptName == null) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "Missing required field: name"));
            }
            
            Map<String, Object> result = protocolHandler.getPrompt(promptName, arguments != null ? arguments : Map.of());
            return ResponseEntity.ok(result);
        } catch (ServerRegistry.ServerNotFoundException e) {
            log.error("Server not found: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            log.error("Error getting prompt: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", e.getMessage()));
        }
    }
}
