# Netlify MCP Gateway

**Unified MCP Gateway** deployed on Netlify Edge Functions, providing a single
entry point for AI assistants to access federated Model Context Protocol (MCP)
servers.

## 🚀 Features

- **Global Edge Deployment**: Sub-50ms latency worldwide via Netlify Edge
- **Intelligent Routing**: Namespace-based routing to backend servers
- **Persistent Caching**: Two-tier cache (memory + Netlify Blobs)
- **Health Monitoring**: Automatic health checks and failover
- **Retry Logic**: Exponential backoff for resilient backend calls
- **TypeScript**: Fully typed with Deno runtime
- **Mobile-Optimized UI**: Responsive design for all screen sizes (44px touch targets, mobile-first)
- **Interactive Web Console**: Test MCP endpoints directly from your browser

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

- [Deno](https://deno.land/) 1.40+ installed
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) (optional, only for
  deployment)
- Netlify account (for production deployment)

## 🏃 Quick Start

### 1. Install Deno

```bash
# Windows (PowerShell)
irm https://deno.land/install.ps1 | iex

# macOS/Linux
curl -fsSL https://deno.land/install.sh | sh

# Or use package managers
# macOS: brew install deno
# Windows: choco install deno
```

### 2. Configure Environment

Create a `.env` file (optional) for backend URLs:

```bash
# Backend MCP server endpoints
JOURNEY_SERVICE_URL=http://localhost:3001
SWISS_MOBILITY_URL=http://localhost:3002
AAREGURU_URL=http://localhost:3003
OPEN_METEO_URL=http://localhost:3004
```

### 3. Run Locally

```bash
# Start dev server with hot reload
deno task dev

# Or run directly
deno run --allow-net --allow-env --allow-read dev.ts
```

The gateway will be available at:

- **API**: `http://localhost:8888/mcp/*`
- **Web UI**: `http://localhost:8888/`
- **Health**: `http://localhost:8888/health`

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

## 🧪 Development

### Available Tasks

```bash
deno task dev        # Start dev server with hot reload
deno task test       # Run tests
deno task check      # Type check all files
deno task lint       # Lint code
deno task fmt        # Format code
deno task fmt:check  # Check formatting
```

### Project Structure

```
deno-mcp-gateway/
├── dev.ts                    # Local dev server (Deno HTTP)
├── deno.json                 # Deno config & tasks
├── netlify.toml              # Netlify deployment config
├── netlify/
│   └── edge-functions/
│       └── mcp.ts           # Main edge function handler
├── src/
│   ├── init.ts              # Gateway initialization
│   ├── config.ts            # Configuration
│   ├── cache/               # Response caching
│   ├── client/              # Backend HTTP client
│   ├── protocol/            # MCP protocol handlers
│   ├── registry/            # Server registry
│   ├── routing/             # Intelligent routing
│   └── types/               # TypeScript types
└── public/
    ├── index.html           # Web UI
    ├── app.js               # Client-side JS
    └── styles.css           # Styling
```

## 🚀 Deployment

### Deploy to Netlify

#### Option 1: Automatic Git Deployment (Recommended)

1. **Push to GitHub**:

   ```bash
   git push origin master
   ```

2. **Netlify auto-deploys** from GitHub (if connected)

3. **Set environment variables** in Netlify dashboard:
   - `JOURNEY_SERVICE_URL`
   - `SWISS_MOBILITY_URL`
   - `AAREGURU_URL`
   - `OPEN_METEO_URL`

#### Option 2: Manual CLI Deployment

```bash
# Install Netlify CLI (one-time)
deno install --allow-all https://deno.land/x/netlify_cli/netlify.ts

# Or use npm (if you have Node.js)
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

### Deploy to Deno Deploy (Alternative)

The project can also be deployed to [Deno Deploy](https://deno.com/deploy):

1. **Push to GitHub**
2. **Connect repository** to Deno Deploy
3. **Set entry point** to `dev.ts`
4. **Configure environment variables**

Benefits:

- Native Deno platform
- Global edge network
- Zero config needed
- Built-in analytics

### Deploy to Cloudflare Workers (Alternative)

With minimal changes, can deploy to Cloudflare Workers:

1. Adapt `dev.ts` to Cloudflare Workers format
2. Use `wrangler` CLI for deployment
3. Benefits: even larger edge network

## 🔧 Configuration

### Environment Variables

| Variable              | Description             | Example                        |
| --------------------- | ----------------------- | ------------------------------ |
| `JOURNEY_SERVICE_URL` | Journey Service backend | `https://journey.example.com`  |
| `SWISS_MOBILITY_URL`  | Swiss Mobility backend  | `https://mobility.example.com` |
| `AAREGURU_URL`        | Aareguru backend        | `https://aareguru.example.com` |
| `OPEN_METEO_URL`      | Open Meteo backend      | `https://meteo.example.com`    |
| `PORT`                | Local dev server port   | `8888` (default)               |
| `DEBUG`               | Enable debug logging    | `true` or `false`              |

### Cache Configuration

Edit [src/config.ts](src/config.ts):

```typescript
export const loadConfig = (): GatewayConfig => ({
  cache: {
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxEntries: 1000,
  },
  // ...
});
```

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
deno-mcp-gateway/
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
