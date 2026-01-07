package ch.sbb.mcp.gateway.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents the capabilities of a backend MCP server.
 * 
 * <p>Contains lists of tools, resources, and prompts provided by the server.</p>
 */
public record ServerCapabilities(
    List<String> tools,
    List<ResourceCapability> resources,
    List<String> prompts
) {
    
    /**
     * Default constructor with empty lists.
     */
    public ServerCapabilities() {
        this(new ArrayList<>(), new ArrayList<>(), new ArrayList<>());
    }
    
    /**
     * Compact constructor for validation.
     */
    public ServerCapabilities {
        tools = tools != null ? new ArrayList<>(tools) : new ArrayList<>();
        resources = resources != null ? new ArrayList<>(resources) : new ArrayList<>();
        prompts = prompts != null ? new ArrayList<>(prompts) : new ArrayList<>();
    }
    
    /**
     * Resource capability with URI prefix.
     */
    public record ResourceCapability(
        String uriPrefix,
        String description
    ) {
        public ResourceCapability {
            if (uriPrefix == null || uriPrefix.isBlank()) {
                throw new IllegalArgumentException("URI prefix cannot be null or blank");
            }
        }
    }
}
