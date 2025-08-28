#!/bin/bash

# SchedulePro Docker Deployment Script

set -e

echo "🚀 Starting SchedulePro Docker Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose > /dev/null 2>&1; then
    print_error "docker-compose is not installed. Please install docker-compose and try again."
    exit 1
fi

# Create production environment file if it doesn't exist
if [ ! -f .env.production ]; then
    print_warning "Production environment file not found. Creating from template..."
    cp .env.production.template .env.production
    print_warning "Please edit .env.production with your production values before deploying!"
    read -p "Press Enter to continue or Ctrl+C to exit..."
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down

# Remove old images (optional)
read -p "Do you want to remove old images to save space? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Removing old images..."
    docker image prune -f
fi

# Build and start services
print_status "Building and starting services..."
docker-compose up --build -d

# Wait for services to be healthy
print_status "Waiting for services to be healthy..."
sleep 10

# Check service health
check_service() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    print_status "Checking $service health..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s $url > /dev/null 2>&1; then
            print_success "$service is healthy!"
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts: $service not ready yet..."
        sleep 5
        attempt=$((attempt + 1))
    done
    
    print_error "$service failed to become healthy after $max_attempts attempts"
    return 1
}

# Check database migration
print_status "Running database migrations..."
docker-compose exec -T api npx prisma migrate deploy

# Check API health
check_service "API" "http://localhost:3001/api/v1/health"

# Check Web health
check_service "Frontend" "http://localhost:3000"

print_success "🎉 SchedulePro deployment completed successfully!"
print_status "Services available at:"
echo "  📚 API Documentation: http://localhost:3001/api/docs"
echo "  🌐 Frontend Application: http://localhost:3000"
echo "  📧 MailHog (Email Testing): http://localhost:8025"
echo "  🗄️  Database: localhost:5432"
echo "  🗃️  Redis: localhost:6379"

print_status "To view logs: docker-compose logs -f"
print_status "To stop services: docker-compose down"
