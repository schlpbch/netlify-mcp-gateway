# Changelog

All notable changes to the MCP Gateway project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-07

### Added

#### Core Features

- **Unified Gateway**: Single entry point for all federated MCP servers
- **Intelligent Routing**: Namespace-aware routing to backend servers
- **Response Caching**: In-memory caching with Caffeine (configurable TTL)
- **Health Monitoring**: Scheduled health checks with automatic failover
- **Retry Logic**: Exponential backoff for backend communication
- **Server Registry**: Thread-safe server registration and lookup

#### Components

- `GatewayMcpController`: REST endpoints for MCP protocol
- `McpProtocolHandler`: Capability aggregation and namespace management
- `IntelligentRouter`: Cache-aware routing with health checking
- `ServerRegistry`: Server registration and resolution
- `ResponseCache`: In-memory caching with Caffeine
- `BackendMcpClient`: HTTP client with retry logic
- `ServerHealthMonitor`: Scheduled health checking

#### Architecture

- **Lombok-Free**: Modern Java 21 with records for domain models
- **Java Records**: `ServerRegistration`, `ServerHealth`, `ServerCapabilities`
- **Standard POJOs**: Configuration classes with explicit getters/setters
- **SLF4J Logging**: Standard `LoggerFactory.getLogger()` pattern

#### Deployment

- **Cloud Run**: Deployed to Google Cloud Run (europe-west6)
- **Docker Build**: Standard Docker build pipeline
- **Cloud Build**: Automated CI/CD with `cloudbuild.yaml`
- **Public Access**: Unauthenticated access enabled

#### Testing

- **Integration Tests**: `ServerRegistryIntegrationTest` (10 tests passing)
- **Test Coverage**: Core registry logic verified
- **Build Success**: Maven build and tests passing

#### Documentation

- **README.md**: Project overview and quick start
- **DEPLOYMENT.md**: Comprehensive deployment guide
- **MIGRATION_GUIDE.md**: User migration from 4 servers to gateway
- **ARCHITECTURE.md**: Technical architecture and design decisions
- **CONTRIBUTING.md**: Developer contribution guidelines
- **MCP_GATEWAY_PLAN.md**: Implementation plan (marked as IMPLEMENTED)
- **GitHub Issue Template**: Backend URL configuration guide

#### Configuration

- **Namespace Mapping**:
  - `journey.*` → journey-service-mcp
  - `mobility.*` → swiss-mobility-mcp
  - `aareguru.*` → aareguru-mcp
  - `meteo.*` → open-meteo-mcp
- **Environment Variables**: Support for backend URL configuration
- **Profiles**: dev, prod profiles with appropriate defaults

### Technical Details

- **Java Version**: 21 LTS
- **Spring Boot**: 3.4.1
- **Build Tool**: Maven 3.9+
- **Caching**: Caffeine (in-memory)
- **Retry**: Spring Retry with exponential backoff
- **Container**: Docker with eclipse-temurin:21-jre-alpine base
- **Deployment**: Google Cloud Run

### Known Issues

- Backend service URLs need to be configured via environment variables
- Application requires configuration to become fully operational
- See [GitHub Issue Template](/.github/ISSUE_TEMPLATE/configure-backend-urls.md) for details

### Deployment URL

- **Production**: <https://mcp-gateway-874479064416.europe-west6.run.app>

### Commits

- 679d9b6: docs: add comprehensive project documentation
- cf4a2ab: docs: add GitHub issue template for backend URL configuration
- 70c5da9: ci: update Cloud Build to use Docker build and deploy to Cloud Run
- fea7e0f: test: add integration tests for ServerRegistry
- 56cef50: docs: update README with comprehensive configuration and API guide
- eddad52: docs: update MCP_GATEWAY_PLAN.md to reflect completed implementation
- 78284f8: feat: initial commit - MCP Gateway with Java records (Lombok-free)

### Contributors

- Initial implementation and deployment

---

## [Unreleased]

### Planned

- Backend URL configuration automation
- Authentication and authorization
- Rate limiting
- Monitoring dashboards
- Load testing and performance optimization
- WebSocket transport support
- Circuit breaker pattern
- Distributed tracing

[0.1.0]: https://github.com/your-org/sbb-mcp-gateway/releases/tag/v0.1.0
