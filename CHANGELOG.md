# Changelog

All notable changes to the Netlify MCP Gateway project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-07

### Changed - Complete Platform Migration

**BREAKING CHANGE**: Migrated from Java/Spring Boot to TypeScript/Deno with Netlify Edge Functions

#### Runtime & Deployment

- **Runtime**: Migrated from JVM (Java 21) to Deno
- **Deployment**: Migrated from Google Cloud Run to Netlify Edge Functions
- **Build Tool**: Replaced Maven with Deno (no build step needed)
- **Package Manager**: Using pnpm for dependency management

#### Architecture

- **Edge Deployment**: Global edge deployment for sub-50ms latency worldwide
- **No Cold Starts**: Edge functions stay warm at the edge
- **Persistent Caching**: Two-tier cache (memory + Netlify Blobs)
- **Simplified Deployment**: No Docker, no container registry

#### Implementation

- **Type System**: Full TypeScript implementation with strict mode
- **Server Registry**: Singleton pattern for backend server management
- **Backend Client**: HTTP client with exponential backoff retry logic
- **Response Cache**: Two-tier caching (in-memory + Netlify Blobs)
- **Intelligent Router**: Cache-aware routing with health checks
- **Protocol Handler**: MCP protocol aggregation from federated servers
- **Edge Function**: Single function handling all MCP endpoints

#### Configuration

- **Environment Variables**: Replaced YAML configuration with env vars
- **Backend URLs**: Configurable via environment variables
- **Cache Settings**: TTL and size configurable
- **Retry Policy**: Configurable attempts, backoff, and delays

#### Files Created

- 11 TypeScript source files
- `deno.json` - Deno configuration
- `netlify.toml` - Netlify Edge Functions configuration
- `.npmrc` - pnpm configuration
- Comprehensive documentation (README, walkthrough, deployment guide)

#### Maintained Compatibility

- ✅ Same namespace routing (`journey.*`, `mobility.*`, etc.)
- ✅ Same MCP protocol endpoints
- ✅ Same retry logic (exponential backoff)
- ✅ Same health monitoring approach
- ✅ Compatible with Claude Desktop

### Added

- Netlify Blobs for persistent edge caching
- Dynamic TTL based on data characteristics
- Health check endpoint at `/health`
- Landing page at root URL
- pnpm package manager support

### Removed

- Java/Spring Boot codebase (preserved in git history)
- Maven build configuration
- Docker/Jib containerization
- Caffeine cache library
- Cloud Run deployment configuration

---

## [0.1.0] - 2026-01-07

### Added - Initial Java/Spring Boot Implementation

- Hub-and-spoke gateway architecture
- Namespace-based routing to federated servers
- In-memory caching with Caffeine
- Health monitoring with scheduled checks
- Retry logic with exponential backoff
- Support for 4 backend servers:
  - journey-service-mcp
  - swiss-mobility-mcp
  - aareguru-mcp
  - open-meteo-mcp
- Deployment to Google Cloud Run
- Comprehensive documentation

---

## Migration Notes

The 0.2.0 release represents a complete platform migration while maintaining API compatibility. All MCP protocol endpoints remain unchanged, ensuring seamless integration with existing clients like Claude Desktop.

**Key Benefits of Migration:**

- 🌍 Global edge deployment (sub-50ms latency)
- ⚡ No cold starts
- 💾 Persistent caching across invocations
- 🚀 Simpler deployment (no containers)
- 💰 Lower operational costs

**Migration Path:**
Existing Java/Spring Boot code is preserved in git history. The TypeScript/Deno implementation is a complete rewrite optimized for edge deployment.
