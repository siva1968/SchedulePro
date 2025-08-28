@echo off
echo 🚀 Setting up SchedulePro development environment...

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18 or higher.
    exit /b 1
)

REM Check if Docker is installed
where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker.
    exit /b 1
)

REM Install global dependencies
echo 📦 Installing global dependencies...
npm install -g @nestjs/cli turbo prisma

REM Install project dependencies
echo 📦 Installing project dependencies...
npm install

REM Setup environment variables
echo ⚙️  Setting up environment variables...
if not exist .env.local (
    copy .env.example .env.local
    echo ✅ Created .env.local from .env.example
    echo ⚠️  Please update the values in .env.local as needed
)

if not exist apps\api\.env (
    copy .env.example apps\api\.env
    echo ✅ Created apps\api\.env from .env.example
)

REM Start database services
echo 🐳 Starting database services...
docker-compose up -d postgres redis mailhog

REM Wait for database to be ready
echo ⏳ Waiting for database to be ready...
timeout /t 10 /nobreak >nul

REM Setup database
echo 🗄️  Setting up database...
cd apps\api
npx prisma generate
npx prisma migrate dev --name init

REM Seed database (if seed file exists)
if exist prisma\seed.ts (
    echo 🌱 Seeding database...
    npx prisma db seed
)

cd ..\..

echo.
echo ✅ Development environment setup complete!
echo.
echo 📋 Next steps:
echo    1. Update environment variables in .env.local
echo    2. Configure OAuth credentials for Google/Microsoft
echo    3. Start development servers: npm run dev
echo.
echo 🌐 Services:
echo    Frontend: http://localhost:3000
echo    API: http://localhost:3001
echo    Database: postgresql://localhost:5432/schedulepro
echo    Redis: redis://localhost:6379
echo    Mail UI: http://localhost:8025
echo.
