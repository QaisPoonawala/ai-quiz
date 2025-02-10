# AWS Deployment Guide for xQuizite

This guide explains how to deploy the xQuizite platform on AWS to support 1000+ simultaneous users.

## Prerequisites

1. AWS CLI installed and configured
2. Docker installed
3. Node.js v18+ installed
4. MongoDB Atlas account
5. Domain name registered in Route 53

## Infrastructure Overview

The application uses the following AWS services:

- **CloudFront** - CDN for static content delivery
- **S3** - Static file hosting
- **ECS Fargate** - Container orchestration
- **Application Load Balancer** - Load balancing
- **ElastiCache (Redis)** - Session management and Socket.IO scaling
- **Route 53** - DNS management
- **ACM** - SSL certificate management

## Step-by-Step Deployment

### 1. Initial Setup

```bash
# Install AWS CDK globally
npm install -g aws-cdk

# Configure AWS credentials
aws configure
```

### 2. MongoDB Atlas Setup

1. Create a MongoDB Atlas cluster
2. Configure network access to allow AWS VPC
3. Create a database user
4. Get the connection string

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
NODE_ENV=production
MONGODB_URI=your-mongodb-atlas-uri
REDIS_URL=your-elasticache-endpoint
PORT=5001
```

### 4. Infrastructure Deployment

```bash
# Deploy CDK stack
npm run deploy:infra

# Note the outputs:
# - CloudFront URL
# - ALB DNS name
# - Redis endpoint
```

### 5. Frontend Deployment

```bash
# Build and deploy frontend to S3
npm run deploy:frontend
```

### 6. Backend Deployment

```bash
# Build and push Docker image
npm run deploy:backend
```

## Infrastructure Components

### Frontend (S3 + CloudFront)
- Static files served through CloudFront CDN
- HTTPS enabled with ACM certificate
- Custom domain configured

### Backend (ECS Fargate)
- Auto-scaling enabled (2-10 tasks)
- Each task: 2 vCPU, 4GB RAM
- Health checks configured

### Socket.IO Scaling
- Redis adapter for horizontal scaling
- Sticky sessions enabled on ALB
- WebSocket connections preserved

### Database
- MongoDB Atlas for data persistence
- Connection pooling configured
- Indexes optimized for queries

## Monitoring and Scaling

### CloudWatch Metrics to Monitor
- ECS Service CPU/Memory utilization
- ALB request count/latency
- Redis memory/CPU usage
- Socket.IO connection count

### Auto Scaling Policies
- Scale out at 70% CPU utilization
- Scale out at 70% memory utilization
- Minimum 2 tasks, maximum 10 tasks
- 60-second cooldown periods

## Cost Optimization

Estimated monthly costs (US East region):
- CloudFront: ~$50
- ECS Fargate: ~$150-300
- ElastiCache: ~$100
- ALB: ~$50
- S3: ~$5
- Route 53: ~$1

Total: ~$350-500/month

## Security Considerations

1. **Network Security**
   - VPC with private subnets
   - Security groups properly configured
   - ALB with HTTPS only

2. **Application Security**
   - CORS configured
   - Rate limiting enabled
   - Input validation implemented

3. **Data Security**
   - MongoDB Atlas encryption at rest
   - Redis AUTH enabled
   - SSL/TLS for all connections

## Troubleshooting

### Common Issues

1. **Socket.IO Connections Dropping**
   - Check ALB sticky sessions
   - Verify Redis connection
   - Check security group rules

2. **High Latency**
   - Monitor ECS CPU/Memory
   - Check MongoDB performance
   - Verify CloudFront cache hits

3. **Deployment Failures**
   - Check ECS task logs
   - Verify ECR image push
   - Check CDK deployment logs

## Maintenance

### Regular Tasks

1. **Weekly**
   - Monitor CloudWatch metrics
   - Review ECS task logs
   - Check Redis memory usage

2. **Monthly**
   - Update Node.js dependencies
   - Review security patches
   - Backup MongoDB data

3. **Quarterly**
   - Review AWS costs
   - Update SSL certificates
   - Test scaling capabilities

## Support

For issues or questions:
1. Check CloudWatch logs
2. Review ECS task status
3. Contact AWS support if needed

## Useful Commands

```bash
# View ECS logs
aws logs tail /ecs/quiz-app --follow

# Scale ECS service
aws ecs update-service --cluster quiz-cluster --service quiz-service --desired-count 4

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"

# View Redis metrics
aws cloudwatch get-metric-statistics --namespace AWS/ElastiCache --metric-name CPUUtilization
