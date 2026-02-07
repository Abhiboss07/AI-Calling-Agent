# Production Deployment Guide

## Overview
This guide covers deploying the AI Outbound Calling Agent to production using Docker, Kubernetes, or serverless platforms like Railway or Render.

---

## Pre-Deployment Checklist

- [ ] All environment variables configured (especially secrets)
- [ ] MongoDB installed & backed up (Atlas recommended)
- [ ] Twilio phone numbers provisioned
- [ ] S3 bucket created & IAM roles configured
- [ ] OpenAI API key activated with spend limits
- [ ] HTTPS certificate obtained (Let's Encrypt or AWS ACM)
- [ ] Logging aggregation setup (CloudWatch, Datadog, etc.)
- [ ] Alerting configured for cost & error thresholds
- [ ] Load testing passed (5–10 concurrent calls)
- [ ] Disaster recovery & backup tested

---

## Option 1: Railway (Recommended for Quick Deployment)

### Step 1: Prepare Code
```bash
git push origin main  # Your repo must be on GitHub
```

### Step 2: Create Railway Project
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select your repository
4. Railway auto-detects Node.js and installs dependencies

### Step 3: Add Environment Variables
In Railway dashboard:
- `MONGODB_URI` → paste from MongoDB Atlas
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CALLER_ID`
- `OPENAI_API_KEY`
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `PORT=3000`

### Step 4: Deploy
```bash
# Railway auto-deploys on every push to main
git push origin main
# or click "Deploy" button in Railway dashboard
```

### Step 5: Verify
```bash
curl https://<your-railway-domain>.railway.app/health
# Should return: {"ok": true, "version": "0.1.0", "uptime": ...}
```

### Advantages
- ✅ Zero-config deployment
- ✅ Auto HTTPS with custom domain
- ✅ Automatic scaling
- ✅ Built-in observability

---

## Option 2: Render

### Step 1: Create `render.yaml`
```yaml
services:
  - type: web
    name: ai-calling-agent
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: MONGODB_URI
        fromDatabase:
          name: ai-calling-db
          property: connectionString
      - key: OPENAI_API_KEY
        sync: false
databases:
  - name: ai-calling-db
    dbName: ai_outbound
    user: admin
    region: oregon
```

### Step 2: Deploy
```bash
git push origin main
# Render auto-detects render.yaml and deploys
```

---

## Option 3: Docker + AWS ECS

### Step 1: Create Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY src ./src
COPY .env* ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

EXPOSE 3000
CMD ["npm", "start"]
```

### Step 2: Build & Test Locally
```bash
docker build -t ai-calling-agent:latest .
docker run -d -p 3000:3000 \
  -e MONGODB_URI="mongodb://host.docker.internal:27017/ai_outbound" \
  -e TWILIO_ACCOUNT_SID="..." \
  ai-calling-agent:latest
```

### Step 3: Push to ECR
```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
docker tag ai-calling-agent:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/ai-calling-agent:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/ai-calling-agent:latest
```

### Step 4: Create ECS Task Definition
```json
{
  "family": "ai-calling-agent",
  "containerDefinitions": [
    {
      "name": "ai-calling-agent",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/ai-calling-agent:latest",
      "portMappings": [
        { "containerPort": 3000, "hostPort": 3000, "protocol": "tcp" }
      ],
      "environment": [
        { "name": "MONGODB_URI", "value": "mongodb+srv://..." },
        { "name": "TWILIO_ACCOUNT_SID", "value": "..." }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/ai-calling-agent",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ],
  "requiresCompatibilities": ["EC2"],
  "cpu": "256",
  "memory": "512"
}
```

### Step 5: Create ECS Service
```bash
aws ecs create-service \
  --cluster default \
  --service-name ai-calling-agent \
  --task-definition ai-calling-agent:1 \
  --desired-count 2 \
  --launch-type EC2 \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=ai-calling-agent,containerPort=3000
```

---

## Option 4: Kubernetes

### Step 1: Create Deployment Manifest (`k8s-deployment.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-calling-agent
  labels:
    app: ai-calling-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ai-calling-agent
  template:
    metadata:
      labels:
        app: ai-calling-agent
    spec:
      containers:
      - name: ai-calling-agent
        image: your-registry.azurecr.io/ai-calling-agent:latest
        ports:
        - containerPort: 3000
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: mongodb-uri
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: openai-api-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: ai-calling-agent-svc
spec:
  selector:
    app: ai-calling-agent
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ai-calling-agent-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ai-calling-agent
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Step 2: Deploy to K8s
```bash
kubectl apply -f k8s-deployment.yaml
kubectl get pods -l app=ai-calling-agent
kubectl logs -f deployment/ai-calling-agent
```

---

## Configuration Management

### Environment Variables (Secrets Management)
Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets):

```bash
# AWS Secrets Manager
aws secretsmanager create-secret \
  --name ai-calling-agent/prod \
  --secret-string '{
    "MONGODB_URI": "mongodb+srv://...",
    "OPENAI_API_KEY": "sk-...",
    "TWILIO_ACCOUNT_SID": "AC...",
    "TWILIO_AUTH_TOKEN": "...",
    "S3_BUCKET": "...",
    "S3_REGION": "...",
    "S3_ACCESS_KEY": "...",
    "S3_SECRET_KEY": "..."
  }'
```

Load in application:
```javascript
// src/config/index.js
const AWS = require('@aws-sdk/client-secrets-manager');
const client = new AWS.SecretsManager({ region: process.env.AWS_REGION });
// Fetch & parse secrets
```

---

## Scaling & Load Balancing

### Horizontal Scaling
Configure auto-scaling rules:
- **Scale Up:** CPU > 70% or requests > 1000/min
- **Scale Down:** CPU < 30% for 10 minutes
- **Min replicas:** 2 (high availability)
- **Max replicas:** 10–20 (budget dependent)

### Load Balancing
- Use **Twilio Media Stream sticky routing** (route same callSid to same server)
- Configure **Redis session store** if needed for distributed state
- Use **database** (MongoDB) as source of truth for call state

---

## Monitoring & Observability

### CloudWatch / DataDog
```javascript
// Log all STT/LLM/TTS calls with timing
logger.log(`STT: ${durationMs}ms, confidence: ${confidence}`);
logger.log(`LLM: ${durationMs}ms, tokens: ${tokens}`);
logger.log(`TTS: ${durationMs}ms, chars: ${charCount}`);
```

### Alerts
Set up alerts for:
- Cost spike (daily > ₹500)
- Error rate (> 5% of calls)
- Circuit breaker OPEN
- Database connection failures
- API timeouts (> 10s)

---

## Backup & Disaster Recovery

### MongoDB Backup
```bash
# Automated Atlas backups (AWS/Azure/GCP)
# Or manual backup:
mongodump --uri "mongodb+srv://user:pass@cluster.mongodb.net/ai_outbound" --archive=backup.archive
```

### S3 Lifecycle Policy
```json
{
  "Id": "DeleteOldRecordings",
  "Status": "Enabled",
  "Prefix": "recordings/",
  "Expiration": { "Days": 90 }
}
```

### Disaster Recovery Plan
1. **RTO (Recovery Time Objective):** < 1 hour
2. **RPO (Recovery Point Objective):** < 15 minutes
3. **Steps:**
   - Restore MongoDB from latest backup
   - Restart application servers
   - Verify health checks passing
   - Resume campaigns

---

## CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Run tests
        run: npm test
      
      - name: Build Docker image
        run: docker build -t ai-calling-agent:${{ github.sha }} .
      
      - name: Push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker push $ECR_REGISTRY/ai-calling-agent:${{ github.sha }}
      
      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster production \
            --service ai-calling-agent \
            --force-new-deployment
```

---

## Post-Deployment Verification

```bash
# 1. Health check
curl https://your-app.com/health

# 2. Metrics endpoint
curl https://your-app.com/api/v1/metrics

# 3. Create test campaign & call
curl -X POST https://your-app.com/api/v1/calls/start \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"...","phoneNumber":"+919876543210"}'

# 4. Monitor logs
kubectl logs -f deployment/ai-calling-agent
# or
aws logs tail /ecs/ai-calling-agent --follow
```

---

## Performance Tuning

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Node workers | 2–4 per CPU | Async workload |
| Memory limit | 512MB–1GB | STT/LLM buffering |
| Connection pool | 10–20 | MongoDB + OpenAI concurrency |
| Request timeout | 10s | TTL for STT/LLM calls |
| Circuit breaker reset | 60s | Allow service recovery |

---

## Cost Optimization (Production)

- Use **Reserved Instances** for compute (30–40% savings)
- Enable **S3 Intelligent-Tiering** for recordings
- Negotiate **volume discounts** with OpenAI & Twilio
- Use **CDN** for TTS audio (CloudFront, Cloudflare)
- Monitor & alert on cost anomalies

---

**Last Updated:** February 2026
