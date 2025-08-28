# SchedulePro Docker Deployment

This guide explains how to deploy SchedulePro using Docker and Docker Compose.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux)
- Docker Compose v2.0+
- At least 4GB of available RAM
- At least 2GB of available disk space

## Quick Start

### 1. Environment Configuration

Copy the production environment template:
```bash
cp .env.production.template .env.production
```

Edit `.env.production` with your production values:
- Change `JWT_SECRET` to a secure random string
- Change `NEXTAUTH_SECRET` to a secure random string
- Update database credentials if needed
- Configure email settings

### 2. Deploy with Script (Recommended)

**Windows PowerShell:**
```powershell
.\deploy.ps1
```

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

### 3. Manual Deployment

If you prefer manual deployment:

```bash
# Stop any existing containers
docker-compose down

# Build and start all services
docker-compose up --build -d

# Run database migrations
docker-compose exec api npx prisma migrate deploy

# Check service status
docker-compose ps
```

## Services

After deployment, the following services will be available:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js web application |
| API | http://localhost:3001 | NestJS backend API |
| API Docs | http://localhost:3001/api/docs | Swagger documentation |
| MailHog UI | http://localhost:8025 | Email testing interface |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache and sessions |

## Management Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
```

### Restart Services
```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart api
```

### Stop Services
```bash
docker-compose down
```

### Update Application
```bash
# Pull latest code and rebuild
git pull
docker-compose down
docker-compose up --build -d
```

### Database Operations
```bash
# Run migrations
docker-compose exec api npx prisma migrate deploy

# Access database
docker-compose exec postgres psql -U postgres -d schedulepro

# Backup database
docker-compose exec postgres pg_dump -U postgres schedulepro > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres schedulepro < backup.sql
```

## Troubleshooting

### Service Health Checks

Check if services are healthy:
```bash
docker-compose ps
```

### Port Conflicts

If you get port conflicts, update the ports in `docker-compose.yml`:
```yaml
services:
  web:
    ports:
      - "8000:3000"  # Change 3000 to 8000
  api:
    ports:
      - "8001:3001"  # Change 3001 to 8001
```

### Database Connection Issues

1. Check if PostgreSQL container is running:
```bash
docker-compose logs postgres
```

2. Verify database connection:
```bash
docker-compose exec api npx prisma db push
```

### Memory Issues

If you encounter memory issues:
1. Increase Docker Desktop memory allocation
2. Close unnecessary applications
3. Use `docker system prune` to clean up unused resources

### Build Issues

Clear Docker cache and rebuild:
```bash
docker-compose down
docker system prune -f
docker-compose up --build -d
```

## Production Considerations

### Security
- Change all default passwords and secrets
- Use a reverse proxy (nginx) for SSL termination
- Enable firewall rules
- Regular security updates

### Performance
- Use environment-specific optimizations
- Monitor resource usage
- Set up log rotation
- Configure backup strategies

### Monitoring
- Set up health checks
- Configure alerting
- Monitor disk usage
- Track application metrics

## Environment Variables

Key environment variables in `.env.production`:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@postgres:5432/schedulepro` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `JWT_SECRET` | JWT signing secret | `your-super-secret-jwt-key-change-this-in-production` |
| `NEXTAUTH_SECRET` | NextAuth.js secret | `your-nextauth-secret-change-this-in-production` |
| `SMTP_HOST` | Email server host | `mailhog` |
| `SMTP_PORT` | Email server port | `1025` |

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Docker and application logs
3. Consult the main project documentation
4. Create an issue in the project repository
