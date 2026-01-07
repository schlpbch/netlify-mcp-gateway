---
title: Configure Backend Service URLs for Cloud Run Deployment
labels: configuration, deployment
assignees: 
---

## Description

The MCP Gateway has been successfully deployed to Cloud Run at:
**<https://mcp-gateway-874479064416.europe-west6.run.app>**

However, the application is currently failing to start properly due to missing backend service URL configuration.

## Current Issue

The application logs show a configuration error related to `gatewayProperties`. The backend server URLs are currently set to placeholder values in `application.yml`:

```yaml
mcp:
  gateway:
    servers:
      - id: journey-service-mcp
        endpoint: http://journey-service:8080/mcp  # Placeholder
      - id: swiss-mobility-mcp
        endpoint: http://swiss-mobility:8080/mcp   # Placeholder
      - id: aareguru-mcp
        endpoint: http://aareguru:8000/mcp         # Placeholder
      - id: open-meteo-mcp
        endpoint: http://open-meteo:8000/mcp       # Placeholder
```

## Required Actions

### 1. Identify Backend Service URLs

Get the actual Cloud Run URLs for each backend service:

```bash
# Journey Service
gcloud run services describe journey-service-mcp \
  --region=europe-west6 \
  --project=journey-service-mcp \
  --format="value(status.url)"

# Swiss Mobility
gcloud run services describe swiss-mobility-mcp \
  --region=europe-west6 \
  --project=journey-service-mcp \
  --format="value(status.url)"

# Aareguru
gcloud run services describe aareguru-mcp \
  --region=europe-west6 \
  --project=journey-service-mcp \
  --format="value(status.url)"

# Open Meteo
gcloud run services describe open-meteo-mcp \
  --region=europe-west6 \
  --project=journey-service-mcp \
  --format="value(status.url)"
```

### 2. Update Cloud Run Environment Variables

Set the backend URLs as environment variables:

```bash
gcloud run services update mcp-gateway \
  --region=europe-west6 \
  --project=journey-service-mcp \
  --set-env-vars="\
JOURNEY_SERVICE_URL=https://journey-service-mcp-XXXXX.run.app/mcp,\
SWISS_MOBILITY_URL=https://swiss-mobility-mcp-XXXXX.run.app/mcp,\
AAREGURU_URL=https://aareguru-mcp-XXXXX.run.app/mcp,\
OPEN_METEO_URL=https://open-meteo-mcp-XXXXX.run.app/mcp"
```

### 3. Update application-prod.yml

Ensure `application-prod.yml` reads from environment variables:

```yaml
mcp:
  gateway:
    servers:
      - id: journey-service-mcp
        name: Journey Service
        endpoint: ${JOURNEY_SERVICE_URL:http://localhost:8080/mcp}
        transport: http
        priority: 1
      
      - id: swiss-mobility-mcp
        name: Swiss Mobility
        endpoint: ${SWISS_MOBILITY_URL:http://localhost:8080/mcp}
        transport: http
        priority: 2
      
      - id: aareguru-mcp
        name: Aareguru
        endpoint: ${AAREGURU_URL:http://localhost:8000/mcp}
        transport: http
        priority: 3
      
      - id: open-meteo-mcp
        name: Open Meteo
        endpoint: ${OPEN_METEO_URL:http://localhost:8000/mcp}
        transport: http
        priority: 4
```

### 4. Verify Deployment

After configuration:

```bash
# Check health endpoint
curl https://mcp-gateway-874479064416.europe-west6.run.app/actuator/health

# List available tools
curl https://mcp-gateway-874479064416.europe-west6.run.app/mcp/tools/list

# Check logs
gcloud run services logs read mcp-gateway \
  --region=europe-west6 \
  --project=journey-service-mcp \
  --limit=50
```

## Acceptance Criteria

- [ ] All backend service URLs identified
- [ ] Environment variables set in Cloud Run
- [ ] `application-prod.yml` updated to use environment variables
- [ ] Gateway starts successfully (health endpoint returns 200)
- [ ] Tools/resources/prompts are discoverable via MCP endpoints
- [ ] Documentation updated with actual URLs

## Additional Notes

- The gateway is deployed with `SPRING_PROFILES_ACTIVE=prod`
- Public access is enabled (`--allow-unauthenticated`)
- Resources: 1Gi memory, 2 CPUs
- Min instances: 0, Max instances: 10

## Related Files

- `src/main/resources/application.yml`
- `src/main/resources/application-prod.yml`
- `cloudbuild.yaml`
- `README.md`
