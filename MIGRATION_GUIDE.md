# Migration Guide: From Direct Servers to MCP Gateway

This guide helps you migrate from connecting directly to 4 MCP servers to using the unified MCP Gateway.

## Overview

**Before**: Claude connects to 4 separate MCP servers  
**After**: Claude connects to 1 MCP Gateway that routes to all servers

### Benefits

- ✅ **Single Connection**: One MCP server instead of four
- ✅ **Unified Discovery**: All tools/resources/prompts in one place
- ✅ **Response Caching**: Faster repeated queries
- ✅ **Health Monitoring**: Automatic failover for unhealthy servers
- ✅ **Simplified Configuration**: One URL to manage

## Migration Steps

### Step 1: Backup Current Configuration

Save your current `claude_desktop_config.json`:

```bash
# macOS/Linux
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup

# Windows
copy "%APPDATA%\Claude\claude_desktop_config.json" "%APPDATA%\Claude\claude_desktop_config.json.backup"
```

### Step 2: Update Configuration

Replace the 4 server entries with the gateway:

**Before**:

```json
{
  "mcpServers": {
    "journey-service": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "gcr.io/journey-service-mcp/journey-service:latest"]
    },
    "swiss-mobility": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "gcr.io/journey-service-mcp/swiss-mobility:latest"]
    },
    "aareguru": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "gcr.io/journey-service-mcp/aareguru:latest"]
    },
    "open-meteo": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "gcr.io/journey-service-mcp/open-meteo:latest"]
    }
  }
}
```

**After**:

```json
{
  "mcpServers": {
    "sbb-gateway": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "gcr.io/journey-service-mcp/mcp-gateway:latest"]
    }
  }
}
```

### Step 3: Restart Claude Desktop

Close and reopen Claude Desktop to load the new configuration.

### Step 4: Verify Connection

In Claude, ask:
> "What MCP tools are available?"

You should see all tools from all 4 servers, prefixed with their namespace:

- `journey.*` - Journey Service tools
- `mobility.*` - Swiss Mobility tools
- `aareguru.*` - Aareguru tools
- `meteo.*` - Open Meteo tools

## Tool Name Changes

Tool names now include namespace prefixes to avoid conflicts.

### Journey Service

| Old Name | New Name |
|----------|----------|
| `findTrips` | `journey.findTrips` |
| `getTripDetails` | `journey.getTripDetails` |
| `searchStations` | `journey.searchStations` |

### Swiss Mobility

| Old Name | New Name |
|----------|----------|
| `getTripPricing` | `mobility.getTripPricing` |
| `getRouteOptions` | `mobility.getRouteOptions` |

### Aareguru

| Old Name | New Name |
|----------|----------|
| `getCurrentConditions` | `aareguru.getCurrentConditions` |
| `getSafetyAssessment` | `aareguru.getSafetyAssessment` |

### Open Meteo

| Old Name | New Name |
|----------|----------|
| `getCurrentWeather` | `meteo.getCurrentWeather` |
| `getForecast` | `meteo.getForecast` |

## Prompt Updates

If you have saved prompts or workflows that reference specific tools, update them:

**Before**:

```
Use the findTrips tool to search for connections
```

**After**:

```
Use the journey.findTrips tool to search for connections
```

## Testing Migration

### 1. Test Tool Discovery

```bash
curl -X POST https://mcp-gateway-874479064416.europe-west6.run.app/mcp/tools/list
```

Verify all expected tools are listed.

### 2. Test Tool Execution

```bash
curl -X POST https://mcp-gateway-874479064416.europe-west6.run.app/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "journey.searchStations",
    "arguments": {
      "query": "Zurich"
    }
  }'
```

### 3. Test Resource Access

```bash
curl -X POST https://mcp-gateway-874479064416.europe-west6.run.app/mcp/resources/list
```

### 4. Test Prompts

```bash
curl -X POST https://mcp-gateway-874479064416.europe-west6.run.app/mcp/prompts/list
```

## Rollback Procedure

If you need to revert to the old configuration:

### 1. Restore Backup

```bash
# macOS/Linux
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows
copy "%APPDATA%\Claude\claude_desktop_config.json.backup" "%APPDATA%\Claude\claude_desktop_config.json"
```

### 2. Restart Claude Desktop

Close and reopen Claude Desktop.

## Troubleshooting

### Tools Not Appearing

**Cause**: Gateway not connected or backend servers down.

**Solution**:

1. Check gateway health: `curl https://mcp-gateway-874479064416.europe-west6.run.app/actuator/health`
2. Check Claude Desktop logs
3. Verify Docker is running

### Tool Calls Failing

**Cause**: Incorrect tool names (missing namespace prefix).

**Solution**: Update tool names to include namespace (e.g., `journey.findTrips`).

### Slow Response Times

**Cause**: Cache warming or backend latency.

**Solution**:

- First calls will be slower (cache miss)
- Subsequent calls should be faster (cache hit)
- Monitor gateway logs for backend performance

### Missing Tools

**Cause**: Backend server is unhealthy or not configured.

**Solution**:

1. Check gateway logs for health check failures
2. Verify backend URLs are configured correctly
3. Check backend service status

## Performance Comparison

### Before (Direct Connections)

- **Connection Overhead**: 4 separate connections
- **Discovery Time**: 4 separate discovery calls
- **No Caching**: Every call hits backend
- **No Failover**: Manual intervention required

### After (Gateway)

- **Connection Overhead**: 1 connection
- **Discovery Time**: 1 aggregated call
- **Caching**: Configurable TTL (default 5m)
- **Failover**: Automatic health-based routing

### Expected Improvements

- **Discovery**: ~75% faster (1 call vs 4 calls)
- **Cached Calls**: ~90% faster (in-memory vs network)
- **Reliability**: Higher (automatic failover)

## Advanced Configuration

### Custom Gateway URL

If deploying to a custom domain:

```json
{
  "mcpServers": {
    "sbb-gateway": {
      "url": "https://mcp.yourdomain.com",
      "transport": "http"
    }
  }
}
```

### Authentication

If gateway requires authentication:

```json
{
  "mcpServers": {
    "sbb-gateway": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "API_KEY=your-key", "gcr.io/journey-service-mcp/mcp-gateway:latest"]
    }
  }
}
```

## FAQ

### Q: Do I need to change my prompts?

**A**: Only if they explicitly reference tool names. The namespace prefix is required.

### Q: Will my saved conversations work?

**A**: Yes, but tool calls in old conversations will use old names. New conversations will use new names.

### Q: Can I use both old and new configurations?

**A**: No, choose one. The gateway provides all functionality of the 4 servers.

### Q: What happens if the gateway goes down?

**A**: You can rollback to direct connections using the backup configuration.

### Q: Is there any data loss during migration?

**A**: No, the gateway is stateless. All data remains in backend services.

## Support

For issues or questions:

1. Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment issues
2. Check gateway logs: `gcloud run services logs read mcp-gateway`
3. Open a GitHub issue with details

## Next Steps

1. Complete migration
2. Test all critical workflows
3. Monitor performance
4. Remove backup configuration after 1 week of stable operation
