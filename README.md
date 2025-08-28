# SchedulePro - Professional Appointment Scheduling Platform

SchedulePro is a comprehensive appointment scheduling platform built with modern technologies. This project implements a full-stack solution with a Next.js frontend and NestJS backend.

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- Docker and Docker Compose
- Git

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd schedulepro
   ```

2. **Run the setup script**
   
   **Windows:**
   ```cmd
   .\tools\scripts\setup.bat
   ```
   
   **Linux/Mac:**
   ```bash
   chmod +x ./tools/scripts/setup.sh
   ./tools/scripts/setup.sh
   ```

3. **Update environment variables**
   
   Edit `.env.local` and `apps/api/.env` with your actual values:
   - Database URL
   - JWT secrets
   - OAuth credentials (Google, Microsoft)
   - SMTP settings

4. **Start development servers**
   ```bash
   npm run dev
   ```

## 🏗️ Project Structure

```
schedulepro/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/           # App router pages
│   │   │   ├── components/    # Reusable components
│   │   │   ├── lib/           # Utilities and API client
│   │   │   └── store/         # Zustand state management
│   │   └── package.json
│   └── api/                   # NestJS backend
│       ├── src/
│       │   ├── auth/          # Authentication module
│       │   ├── users/         # User management
│       │   ├── organizations/ # Organization management
│       │   ├── meeting-types/ # Meeting type management
│       │   ├── bookings/      # Booking management
│       │   ├── availability/  # Availability management
│       │   ├── calendar-integrations/ # Calendar sync
│       │   ├── notifications/ # Email/SMS notifications
│       │   ├── database/      # Prisma configuration
│       │   └── config/        # App configuration
│       ├── prisma/            # Database schema and migrations
│       └── package.json
├── packages/
│   ├── shared/                # Shared utilities
│   ├── ui/                    # UI components library
│   ├── types/                 # TypeScript definitions
│   └── config/                # Configuration packages
├── tools/
│   ├── scripts/               # Setup and utility scripts
│   └── docker/                # Docker configurations
├── docker-compose.yml         # Local development services
├── package.json               # Root package.json
└── turbo.json                 # Turborepo configuration
```

## 🛠️ Technology Stack

### Backend
- **Framework:** NestJS with Express
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT with Passport.js
- **Caching:** Redis
- **API Documentation:** Swagger/OpenAPI
- **Validation:** class-validator and class-transformer
- **Testing:** Jest

### Frontend
- **Framework:** Next.js 14 with App Router
- **UI Components:** Radix UI + Custom component library
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Forms:** React Hook Form with Zod validation
- **HTTP Client:** Axios
- **Testing:** Jest + React Testing Library

### DevOps & Infrastructure
- **Containerization:** Docker
- **Cloud Platform:** Microsoft Azure
- **CI/CD:** Azure DevOps / GitHub Actions
- **Monitoring:** Azure Application Insights
- **Database:** Azure PostgreSQL Flexible Server

## 🔧 Development

### Available Scripts

```bash
# Install dependencies
npm install

# Start development servers (both frontend and backend)
npm run dev

# Build all applications
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# Database operations
npm run db:migrate      # Run migrations
npm run db:generate     # Generate Prisma client
npm run db:seed         # Seed database
npm run db:studio       # Open Prisma Studio
```

### Environment Variables

#### Backend (`apps/api/.env`)
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/schedulepro"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-jwt-secret-key"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
MICROSOFT_CLIENT_ID="your-microsoft-client-id"
MICROSOFT_CLIENT_SECRET="your-microsoft-client-secret"
```

#### Frontend (`apps/web/.env.local`)
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## 🌐 Services

When running locally, you can access:

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **API Documentation:** http://localhost:3001/api/docs
- **Database:** postgresql://localhost:5432/schedulepro
- **Redis:** redis://localhost:6379
- **Email UI (MailHog):** http://localhost:8025
- **Prisma Studio:** `npm run db:studio`

## 📱 Features

### Phase 1 (MVP) - Implemented
- ✅ User authentication and authorization
- ✅ Organization management
- ✅ Meeting type creation and management
- ✅ Basic booking system
- ✅ Availability management
- ✅ Calendar integrations (Google, Outlook)
- ✅ Email notifications
- ✅ Basic dashboard

### Phase 2 (Planned)
- Team scheduling with round-robin
- Advanced branding and customization
- Automated workflows
- CRM integrations
- Mobile applications
- Analytics dashboard

### Phase 3 (Planned)
- AI scheduling assistant
- Predictive analytics
- Enterprise security features
- Advanced reporting
- API marketplace

## 🔒 Security

- JWT-based authentication
- Password hashing with bcrypt
- Input validation and sanitization
- CORS protection
- Rate limiting
- Helmet for security headers
- Environment variable validation

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e
```

## 📖 API Documentation

The API documentation is automatically generated using Swagger and is available at:
- Development: http://localhost:3001/api/docs
- Staging: https://api-staging.schedulepro.com/api/docs

## 🚀 Deployment

### Local Development
```bash
docker-compose up -d  # Start database services
npm run dev          # Start development servers
```

### Production Deployment
The application is designed to be deployed on Microsoft Azure using:
- Azure App Service for the backend
- Azure Static Web Apps for the frontend
- Azure Database for PostgreSQL
- Azure Cache for Redis
- Azure Application Insights for monitoring

## 🤝 Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is private and proprietary. All rights reserved.

## 🆘 Support

For support and questions:
- Check the API documentation
- Review the implementation guide
- Contact the development team

---

**Happy Scheduling! 📅**
