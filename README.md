# Netlify MCP Gateway

**Unified MCP Gateway** deployed on Netlify Edge Functions, providing a single entry point for AI assistants to access federated Model Context Protocol (MCP) servers.

## 🚀 Features

- **Global Edge Deployment**: Sub-50ms latency worldwide via Netlify Edge
- **Intelligent Routing**: Namespace-based routing to backend servers
- **Persistent Caching**: Two-tier cache (memory + Netlify Blobs)
- **Health Monitoring**: Automatic health checks and failover
- **Retry Logic**: Exponential backoff for resilient backend calls
- **TypeScript**: Fully typed with Deno runtime

## 🏗️ Architecture

```text
Claude Desktop
     ↓
Netlify Edge Functions (Global)
     ↓
MCP Gateway
     ├── journey-service-mcp
     ├── swiss-mobility-mcp
     ├── aareguru-mcp
     └── open-meteo-mcp
```

### Namespace Routing

Tools and prompts are namespaced to avoid collisions:

- `journey.*` → Journey Service MCP
- `mobility.*` → Swiss Mobility MCP
- `aareguru.*` → Aareguru MCP
- `meteo.*` / `weather.*` → Open Meteo MCP

Example: `journey.findTrips` routes to Journey Service's `findTrips` tool.

## 🛠️ Technology Stack

- **Runtime**: Deno (via Netlify Edge Functions)
- **Language**: TypeScript 5.x (strict mode)
- **Caching**: Netlify Blobs + in-memory
- **Deployment**: Netlify Edge Functions

## 📋 Prerequisites

- [Deno](https://deno.land/) installed
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed
- Netlify account

## 🏃 Quick Start

### 1. Install Dependencies

```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Install Netlify CLI globally
pnpm add -g netlify-cli

# Install Deno (Windows PowerShell)
irm https://deno.land/install.ps1 | iex
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure backend URLs:

```bash
cp .env.example .env
```

### 3. Run Locally

```bash
netlify dev
```

The gateway will be available at `http://localhost:8888/mcp/*`

### 4. Test Endpoints

```bash
# List tools
curl http://localhost:8888/mcp/tools/list

# Call a tool
curl -X POST http://localhost:8888/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"journey.findTrips","arguments":{"from":"Bern","to":"Zurich"}}'

# Health check
curl http://localhost:8888/health
```

## 🚀 Deployment

### Deploy to Netlify

```bash
# Login to Netlify
netlify login

# Deploy to production
netlify deploy --prod
```

### Environment Variables

Configure these in Netlify UI (Site settings → Environment variables):

- `JOURNEY_SERVICE_URL`
- `SWISS_MOBILITY_URL`
- `AAREGURU_URL`
- `OPEN_METEO_URL`

## 🔌 API Endpoints

### MCP Protocol

- `GET /mcp/tools/list` - List available tools
- `POST /mcp/tools/call` - Execute a tool
- `GET /mcp/resources/list` - List available resources
- `POST /mcp/resources/read` - Read a resource
- `GET /mcp/prompts/list` - List available prompts
- `POST /mcp/prompts/get` - Get a prompt

### Health

- `GET /health` - Gateway health status

## 🧪 Testing

```bash
# Run Deno tests
deno test --allow-net --allow-env

# Lint code
deno lint src/ netlify/

# Format code
deno fmt src/ netlify/
```

## 📁 Project Structure

```text
netlify-mcp-gateway/
├── netlify/
│   └── edge-functions/
│       └── mcp.ts              # Main edge function
├── src/
│   ├── types/
│   │   ├── server.ts           # Server types
│   │   ├── mcp.ts              # MCP protocol types
│   │   └── config.ts           # Configuration types
│   ├── registry/
│   │   ├── ServerRegistry.ts   # Server registration
│   │   └── NamespaceResolver.ts # Namespace routing
│   ├── client/
│   │   └── BackendMcpClient.ts # HTTP client with retry
│   ├── cache/
│   │   └── ResponseCache.ts    # Two-tier caching
│   ├── routing/
│   │   └── IntelligentRouter.ts # Cache-aware routing
│   ├── protocol/
│   │   └── McpProtocolHandler.ts # MCP protocol handler
│   ├── config.ts               # Configuration loader
│   └── init.ts                 # Gateway initialization
├── deno.json                   # Deno configuration
├── netlify.toml                # Netlify configuration
└── package.json                # NPM scripts
```

## ⚙️ Configuration

### Cache TTL

The gateway uses dynamic TTL based on data characteristics:

- **Static data** (locations, stations): 1 hour
- **Real-time data** (trips, weather): 1 minute
- **Default**: 5 minutes

### Retry Policy

- Max attempts: 3
- Backoff delay: 100ms
- Backoff multiplier: 2.0
- Max delay: 2s

## 🔒 Security

Current implementation:

- Public access (no authentication)
- HTTPS enforced by Netlify
- No rate limiting

**Recommended for production:**

- Add API key authentication
- Implement rate limiting
- Add request validation
- Monitor usage patterns

## 📊 Monitoring

Key metrics to monitor:

- Request count and latency (P50, P95, P99)
- Cache hit rate
- Backend health status
- Error rate by endpoint

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📝 License

MIT

## 🔗 Related Projects

- [journey-service-mcp](https://github.com/schlpbch/journey-service-mcp)
- [swiss-mobility-mcp](https://github.com/schlpbch/swiss-mobility-mcp)
- [aareguru-mcp](https://github.com/schlpbch/aareguru-mcp)
- [open-meteo-mcp](https://github.com/schlpbch/open-meteo-mcp)
