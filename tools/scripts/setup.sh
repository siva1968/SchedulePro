#!/bin/bash

echo "🚀 Setting up SchedulePro development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker."
    exit 1
fi

# Install global dependencies
echo "📦 Installing global dependencies..."
npm install -g @nestjs/cli turbo prisma

# Install project dependencies
echo "📦 Installing project dependencies..."
npm install

# Setup environment variables
echo "⚙️  Setting up environment variables..."
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo "✅ Created .env.local from .env.example"
    echo "⚠️  Please update the values in .env.local as needed"
fi

if [ ! -f apps/api/.env ]; then
    cp .env.example apps/api/.env
    echo "✅ Created apps/api/.env from .env.example"
fi

# Start database services
echo "🐳 Starting database services..."
docker-compose up -d postgres redis mailhog

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Setup database
echo "🗄️  Setting up database..."
cd apps/api
npx prisma generate
npx prisma migrate dev --name init

# Seed database (if seed file exists)
if [ -f prisma/seed.ts ]; then
    echo "🌱 Seeding database..."
    npx prisma db seed
fi

cd ../..

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Update environment variables in .env.local"
echo "   2. Configure OAuth credentials for Google/Microsoft"
echo "   3. Start development servers: npm run dev"
echo ""
echo "🌐 Services:"
echo "   Frontend: http://localhost:3000"
echo "   API: http://localhost:3001"
echo "   Database: postgresql://localhost:5432/schedulepro"
echo "   Redis: redis://localhost:6379"
echo "   Mail UI: http://localhost:8025"
echo ""
