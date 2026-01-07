# Contributing to MCP Gateway

Thank you for your interest in contributing to the MCP Gateway! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the project's coding standards

## Getting Started

### Prerequisites

- Java 21 JDK
- Maven 3.9+
- Git
- IDE with Java support (IntelliJ IDEA recommended)
- Docker (for testing)

### Development Setup

1. **Clone the Repository**

```bash
git clone https://github.com/your-org/sbb-mcp-gateway.git
cd sbb-mcp-gateway
```

1. **Build the Project**

```bash
mvn clean install
```

1. **Run Tests**

```bash
mvn test
```

1. **Run Locally**

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## Project Structure

```
sbb-mcp-gateway/
├── src/
│   ├── main/
│   │   ├── java/ch/sbb/mcp/gateway/
│   │   │   ├── cache/          # Response caching
│   │   │   ├── client/         # Backend HTTP clients
│   │   │   ├── config/         # Spring configuration
│   │   │   ├── model/          # Domain models (Java records)
│   │   │   ├── protocol/       # MCP protocol handlers
│   │   │   ├── registry/       # Server registry
│   │   │   └── routing/        # Intelligent routing
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── application-dev.yml
│   │       └── application-prod.yml
│   └── test/
│       └── java/ch/sbb/mcp/gateway/
│           ├── integration/    # Integration tests
│           └── registry/       # Unit tests
├── .github/
│   └── ISSUE_TEMPLATE/
├── cloudbuild.yaml
├── Dockerfile
├── pom.xml
└── README.md
```

## Coding Standards

### Java Style

- **Java Version**: Java 21
- **Formatting**: Follow Google Java Style Guide
- **Line Length**: 120 characters max
- **Indentation**: 4 spaces (no tabs)

### Naming Conventions

- **Classes**: PascalCase (`ServerRegistry`)
- **Methods**: camelCase (`resolveToolServer`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TTL`)
- **Packages**: lowercase (`ch.sbb.mcp.gateway.routing`)

### Code Organization

- **One class per file**
- **Package by feature** (not by layer)
- **Keep classes focused** (Single Responsibility Principle)
- **Prefer composition over inheritance**

### Documentation

- **JavaDoc**: Required for public APIs
- **Comments**: Explain "why", not "what"
- **README**: Update for new features
- **Architecture docs**: Update for design changes

### Example

```java
/**
 * Resolves the appropriate backend server for a given tool name.
 * 
 * <p>Tool names are expected to be namespaced (e.g., "journey.findTrips").
 * This method extracts the server ID from the namespace and verifies
 * the server actually provides the requested tool.</p>
 * 
 * @param toolName the namespaced tool name
 * @return the server registration
 * @throws ServerNotFoundException if no server is found or tool not supported
 */
public ServerRegistration resolveToolServer(String toolName) {
    // Implementation
}
```

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

Branch naming:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/fixes

### 2. Make Your Changes

- Write clean, readable code
- Follow coding standards
- Add tests for new functionality
- Update documentation

### 3. Test Your Changes

```bash
# Run all tests
mvn clean test

# Run specific test
mvn test -Dtest=ServerRegistryIntegrationTest

# Check test coverage
mvn test jacoco:report
```

### 4. Commit Your Changes

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add support for WebSocket transport"
git commit -m "fix: resolve cache key collision issue"
git commit -m "docs: update deployment guide"
```

Commit message format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Test additions
- `chore`: Maintenance

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Pull Request Guidelines

### PR Title

Use conventional commit format:

```
feat: add WebSocket transport support
```

### PR Description

Include:

- **What**: What changes were made
- **Why**: Why the changes were needed
- **How**: How the changes were implemented
- **Testing**: How the changes were tested

Template:

```markdown
## Description
Brief description of changes

## Motivation
Why these changes are needed

## Changes
- Change 1
- Change 2

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review Process

1. **Automated Checks**: CI must pass
2. **Code Review**: At least one approval required
3. **Testing**: All tests must pass
4. **Documentation**: Must be up-to-date

## Testing Guidelines

### Unit Tests

- Test individual components in isolation
- Mock external dependencies
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

Example:

```java
@Test
void shouldResolveToolServerByNamespace() {
    // Arrange
    ServerRegistration server = createTestServer("journey-service-mcp");
    registry.register(server);
    
    // Act
    ServerRegistration found = registry.resolveToolServer("journey.findTrips");
    
    // Assert
    assertThat(found).isNotNull();
    assertThat(found.id()).isEqualTo("journey-service-mcp");
}
```

### Integration Tests

- Test component interactions
- Use real dependencies where possible
- Test end-to-end flows
- Use `@SpringBootTest` for full context

### Test Coverage

- Aim for >80% code coverage
- Focus on critical paths
- Don't test trivial code (getters/setters)
- Test edge cases and error conditions

## Documentation

### Code Documentation

- **JavaDoc**: All public APIs
- **Inline Comments**: Complex logic only
- **README**: Feature overview
- **Architecture**: Design decisions

### User Documentation

- **README.md**: Getting started
- **DEPLOYMENT.md**: Deployment guide
- **MIGRATION_GUIDE.md**: Migration steps
- **ARCHITECTURE.md**: Technical details

## Reporting Issues

### Bug Reports

Include:

- **Description**: What happened
- **Expected**: What should happen
- **Steps**: How to reproduce
- **Environment**: OS, Java version, etc.
- **Logs**: Relevant error messages

### Feature Requests

Include:

- **Problem**: What problem does this solve
- **Solution**: Proposed solution
- **Alternatives**: Other options considered
- **Impact**: Who benefits from this

## Release Process

1. **Version Bump**: Update `pom.xml`
2. **Changelog**: Update CHANGELOG.md
3. **Tag**: Create git tag
4. **Build**: Run full build and tests
5. **Deploy**: Deploy to staging
6. **Verify**: Run smoke tests
7. **Release**: Deploy to production
8. **Announce**: Notify users

## Getting Help

- **Documentation**: Check README and guides
- **Issues**: Search existing issues
- **Discussions**: Ask in GitHub Discussions
- **Email**: Contact maintainers

## Recognition

Contributors will be:

- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## Questions?

Feel free to ask questions by:

- Opening an issue
- Starting a discussion
- Contacting maintainers

Thank you for contributing! 🎉
