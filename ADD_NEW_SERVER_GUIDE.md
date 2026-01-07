
## How to Add a New MCP Server

The MCP Gateway supports two methods for adding new servers: **static configuration** (pre-configured in `application.yml`) and **dynamic registration** (servers register themselves at startup).

### Method 1: Static Configuration (Recommended for Development)

Add the server to the gateway's `application.yml`:

#### Step 1: Update Gateway Configuration

Edit `src/main/resources/application.yml`:

``yaml
mcp:
  gateway:
    servers:
      # Existing servers...
      
      # New server
      - id: hotel-mcp
        name: Hotel Booking Service
        endpoint: c:\Users\schlp\code\swiss-mobility-mcp{HOTEL_SERVICE_URL:http://hotel-service:8080/mcp}
        transport: http
        priority: 2
``

#### Step 2: Set Environment Variables

For local development, add to your `.env` file:

``bash
HOTEL_SERVICE_URL=http://localhost:8085/mcp
``

For Cloud Run deployment, add to `cloudbuild.yaml`:

``yaml
- '--set-env-vars=HOTEL_SERVICE_URL=https://hotel-mcp.sbb.ch/mcp'
``

#### Step 3: Restart Gateway

``bash
mvn spring-boot:run
``

The gateway will automatically discover the new server's capabilities on startup.

---

### Method 2: Dynamic Registration (Recommended for Production)

Servers register themselves with the gateway at startup using a REST API.

#### For Java/Spring Boot Servers

See the full implementation in the MCP_GATEWAY_PLAN.md document.

#### For Python/FastMCP Servers

See the full implementation in the MCP_GATEWAY_PLAN.md document.

---

### Verification

After adding a new server, verify it's registered correctly:

1. **Check Gateway Logs**: Look for registration confirmation
2. **Query Gateway API**: `curl http://localhost:8080/api/servers`
3. **Test Tool Discovery**: `curl -X POST http://localhost:8080/mcp/tools/list`
4. **Test Tool Execution**: Call a tool from the new server

### Troubleshooting

- **Server Not Appearing**: Check gateway logs, verify MCP_GATEWAY_ENABLED=true
- **Tools Not Discovered**: Verify tools are registered in McpToolRegistry
- **Tool Calls Failing**: Verify tool name includes correct namespace

### Best Practices

1. Use Semantic Versioning for your server's API
2. Implement `/actuator/health` endpoint for monitoring
3. Server should work standalone even if gateway is unavailable
4. Use clear, descriptive tool names to avoid conflicts
5. Maintain up-to-date documentation of capabilities

