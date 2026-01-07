# MCP Gateway Deployment Guide

This guide covers deploying the MCP Gateway to Google Cloud Run.

## Prerequisites

- Google Cloud SDK (`gcloud`) installed and configured
- Access to the `journey-service-mcp` GCP project (or your target project)
- Docker installed (for local builds)
- Maven 3.9+ and Java 21 (for local development)

## Deployment Methods

### Method 1: Cloud Build (Recommended)

Cloud Build automatically builds, tests, and deploys the gateway.

#### 1. Authenticate with Google Cloud

```bash
gcloud auth login
gcloud config set project journey-service-mcp
```

#### 2. Submit Build

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) .
```

This will:

- Build the project with Maven
- Run all tests
- Build a Docker image
- Push to Google Container Registry
- Deploy to Cloud Run

#### 3. Enable Public Access

If the IAM policy fails during deployment:

```bash
gcloud run services add-iam-policy-binding mcp-gateway \
  --region=europe-west6 \
  --member=allUsers \
  --role=roles/run.invoker \
  --project=journey-service-mcp
```

### Method 2: Local Build + Deploy

Build locally and deploy manually.

#### 1. Build the Application

```bash
mvn clean package -DskipTests
```

#### 2. Build Docker Image

```bash
docker build -t gcr.io/journey-service-mcp/mcp-gateway:latest .
```

#### 3. Push to Container Registry

```bash
docker push gcr.io/journey-service-mcp/mcp-gateway:latest
```

#### 4. Deploy to Cloud Run

```bash
gcloud run deploy mcp-gateway \
  --image=gcr.io/journey-service-mcp/mcp-gateway:latest \
  --region=europe-west6 \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars=SPRING_PROFILES_ACTIVE=prod \
  --memory=1Gi \
  --cpu=2 \
  --min-instances=0 \
  --max-instances=10 \
  --project=journey-service-mcp
```

## Configuration

### Required Environment Variables

The gateway needs URLs for backend MCP servers. Set these as Cloud Run environment variables:

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

### Get Backend Service URLs

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

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Application logging level | `INFO` |
| `CACHE_TTL` | Default cache TTL | `5m` |
| `CACHE_MAX_SIZE` | Max cache entries | `10000` |
| `HEALTH_CHECK_INTERVAL` | Health check frequency | `60s` |

## Verification

### 1. Check Deployment Status

```bash
gcloud run services describe mcp-gateway \
  --region=europe-west6 \
  --project=journey-service-mcp
```

### 2. Test Health Endpoint

```bash
curl https://mcp-gateway-874479064416.europe-west6.run.app/actuator/health
```

Expected response:

```json
{
  "status": "UP"
}
```

### 3. List Available Tools

```bash
curl -X POST https://mcp-gateway-874479064416.europe-west6.run.app/mcp/tools/list \
  -H "Content-Type: application/json"
```

### 4. View Logs

```bash
gcloud run services logs read mcp-gateway \
  --region=europe-west6 \
  --project=journey-service-mcp \
  --limit=50
```

## Troubleshooting

### Gateway Returns 404

**Cause**: Application failed to start or routes not registered.

**Solution**: Check logs for startup errors:

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=mcp-gateway" \
  --limit=50 \
  --project=journey-service-mcp
```

### Configuration Error on Startup

**Cause**: Missing or invalid backend URLs.

**Solution**: Verify environment variables are set:

```bash
gcloud run services describe mcp-gateway \
  --region=europe-west6 \
  --format="value(spec.template.spec.containers[0].env)"
```

### Backend Connection Failures

**Cause**: Backend services are down or URLs are incorrect.

**Solution**:

1. Verify backend services are running
2. Check URLs are correct
3. Ensure gateway has network access to backends

### High Latency

**Cause**: Cache not working or backends are slow.

**Solution**:

1. Check cache hit rate in logs
2. Verify cache configuration
3. Monitor backend response times

## Rollback

If deployment fails or causes issues:

```bash
# List revisions
gcloud run revisions list \
  --service=mcp-gateway \
  --region=europe-west6

# Rollback to previous revision
gcloud run services update-traffic mcp-gateway \
  --region=europe-west6 \
  --to-revisions=REVISION_NAME=100
```

## Monitoring

### Cloud Monitoring Dashboard

Create a dashboard to monitor:

- Request count and latency (P50, P95, P99)
- Error rate
- Cache hit rate
- Backend health status
- Memory and CPU usage

### Alerts

Set up alerts for:

- Error rate > 5%
- P95 latency > 1s
- All backends unhealthy
- Memory usage > 80%

## Security

### Authentication

For production, consider:

- Removing `--allow-unauthenticated`
- Using Cloud Run IAM for service-to-service auth
- Adding API key validation

### Network Security

- Use VPC connector for private backend access
- Configure Cloud Armor for DDoS protection
- Enable Cloud Run security features

## Scaling

The gateway is configured to:

- **Scale to zero**: Min instances = 0
- **Auto-scale**: Up to 10 instances
- **Resources**: 1Gi memory, 2 CPUs per instance

Adjust based on load:

```bash
gcloud run services update mcp-gateway \
  --region=europe-west6 \
  --min-instances=1 \
  --max-instances=20 \
  --memory=2Gi \
  --cpu=4
```

## Cost Optimization

- Use min-instances=0 for dev/staging
- Set appropriate max-instances based on traffic
- Monitor and optimize cache hit rate
- Use Cloud Run's pay-per-use pricing

## Next Steps

1. Configure backend URLs (see above)
2. Set up monitoring and alerts
3. Test with Claude Desktop
4. Review [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for client migration
