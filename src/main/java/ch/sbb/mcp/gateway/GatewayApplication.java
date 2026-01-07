package ch.sbb.mcp.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Main application class for the MCP Gateway service.
 * 
 * <p>The MCP Gateway provides a unified entry point for Claude to access all federated
 * MCP servers in the Swiss Travel Companion ecosystem. It handles intelligent routing,
 * unified tool discovery, response caching, and health monitoring.</p>
 */
@SpringBootApplication
@EnableScheduling
public class GatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
