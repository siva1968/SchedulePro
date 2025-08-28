# SchedulePro Docker Deployment Script for Windows PowerShell

param(
    [switch]$RemoveOldImages = $false
)

Write-Host "🚀 Starting SchedulePro Docker Deployment..." -ForegroundColor Blue

# Function to print colored output
function Write-Status {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Error "Docker is not running. Please start Docker and try again."
    exit 1
}

# Check if docker-compose is available
try {
    docker-compose --version | Out-Null
} catch {
    Write-Error "docker-compose is not installed. Please install docker-compose and try again."
    exit 1
}

# Create production environment file if it doesn't exist
if (-not (Test-Path ".env.production")) {
    Write-Warning "Production environment file not found. Creating from template..."
    Copy-Item ".env.production.template" ".env.production"
    Write-Warning "Please edit .env.production with your production values before deploying!"
    Read-Host "Press Enter to continue or Ctrl+C to exit"
}

# Stop existing containers
Write-Status "Stopping existing containers..."
docker-compose down

# Remove old images (optional)
if ($RemoveOldImages) {
    Write-Status "Removing old images..."
    docker image prune -f
}

# Build and start services
Write-Status "Building and starting services..."
docker-compose up --build -d

# Wait for services to be healthy
Write-Status "Waiting for services to be healthy..."
Start-Sleep 10

# Check service health
function Test-ServiceHealth {
    param(
        [string]$ServiceName,
        [string]$Url,
        [int]$MaxAttempts = 30
    )
    
    Write-Status "Checking $ServiceName health..."
    
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Success "$ServiceName is healthy!"
                return $true
            }
        } catch {
            # Service not ready yet
        }
        
        Write-Status "Attempt $attempt/$MaxAttempts`: $ServiceName not ready yet..."
        Start-Sleep 5
    }
    
    Write-Error "$ServiceName failed to become healthy after $MaxAttempts attempts"
    return $false
}

# Run database migrations
Write-Status "Running database migrations..."
docker-compose exec -T api npx prisma migrate deploy

# Check API health
$apiHealthy = Test-ServiceHealth -ServiceName "API" -Url "http://localhost:3001/api/v1/health"

# Check Web health
$webHealthy = Test-ServiceHealth -ServiceName "Frontend" -Url "http://localhost:3000"

if ($apiHealthy -and $webHealthy) {
    Write-Success "🎉 SchedulePro deployment completed successfully!"
    Write-Status "Services available at:"
    Write-Host "  📚 API Documentation: http://localhost:3001/api/docs"
    Write-Host "  🌐 Frontend Application: http://localhost:3000"
    Write-Host "  📧 MailHog (Email Testing): http://localhost:8025"
    Write-Host "  🗄️  Database: localhost:5432"
    Write-Host "  🗃️  Redis: localhost:6379"
    
    Write-Status "To view logs: docker-compose logs -f"
    Write-Status "To stop services: docker-compose down"
} else {
    Write-Error "Deployment failed. Some services are not healthy."
    Write-Status "Check logs with: docker-compose logs"
}
}
