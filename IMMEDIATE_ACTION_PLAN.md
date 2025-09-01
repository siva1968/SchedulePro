# SchedulePro: Immediate Action Plan (Week 1-2)

## 🔥 URGENT FIXES TO IMPLEMENT NOW

### Day 1: Logging & Debug Cleanup

#### 1. **Create Proper Logging Service**
```bash
# Create logging infrastructure
mkdir -p apps/api/src/common/logger
```

Create the following files:

**apps/api/src/common/logger/logger.service.ts:**
```typescript
import { Injectable, Logger, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppLoggerService extends Logger {
  private logLevels: LogLevel[];

  constructor(private configService: ConfigService) {
    super();
    this.logLevels = this.getLogLevels();
  }

  private getLogLevels(): LogLevel[] {
    const env = this.configService.get('NODE_ENV', 'development');
    
    if (env === 'production') {
      return ['error', 'warn', 'log'];
    } else if (env === 'test') {
      return ['error'];
    }
    return ['error', 'warn', 'log', 'debug', 'verbose'];
  }

  debug(message: string, context?: string): void {
    if (this.logLevels.includes('debug')) {
      super.debug(message, context);
    }
  }

  // Structured logging methods
  logBookingCreated(bookingId: string, hostId: string, attendeeCount: number): void {
    this.log(`Booking created - ID: ${bookingId}, Host: ${hostId}, Attendees: ${attendeeCount}`, 'BookingService');
  }

  logCalendarSync(userId: string, provider: string, success: boolean): void {
    const status = success ? 'SUCCESS' : 'FAILED';
    this.log(`Calendar sync ${status} - User: ${userId}, Provider: ${provider}`, 'CalendarService');
  }

  logEmailSent(to: string, type: string, success: boolean): void {
    const status = success ? 'SENT' : 'FAILED';
    this.log(`Email ${status} - To: ${to}, Type: ${type}`, 'EmailService');
  }
}
```

**apps/api/src/common/logger/logger.module.ts:**
```typescript
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLoggerService } from './logger.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggerModule {}
```

#### 2. **Replace Console.log in BookingsService**
**File: apps/api/src/bookings/bookings.service.ts**

Replace lines 68-85 with:
```typescript
// Remove all console.log statements and replace with:
this.logger.debug('Starting booking validation', 'BookingsService');
this.logger.debug(`Validation params - Host: ${hostId}, MeetingType: ${createBookingDto.meetingTypeId}`, 'BookingsService');

const validationResult = await this.bookingValidationService.validateBookingRequest(
  hostId,
  createBookingDto,
  attendees,
);

this.logger.debug('Booking validation completed', 'BookingsService');

if (!validationResult.isValid) {
  this.logger.warn(`Booking validation failed: ${validationResult.errors.join(', ')}`, 'BookingsService');
  throw new BadRequestException({
    message: 'Booking validation failed',
    errors: validationResult.errors,
    warnings: validationResult.warnings,
  });
}
```

### Day 2: Test Suite Fixes

#### 3. **Fix Prisma Mock Issues**
**File: apps/api/src/common/services/booking-validation.service.spec.ts**

Add proper Prisma mocking at the top of the file:
```typescript
const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  meetingType: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  booking: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  organizationMember: {
    findFirst: jest.fn(),
  },
};

// In beforeEach:
beforeEach(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BookingValidationService,
      {
        provide: PrismaService,
        useValue: mockPrismaService,
      },
    ],
  }).compile();

  service = module.get<BookingValidationService>(BookingValidationService);
  
  // Reset mocks
  jest.clearAllMocks();
  
  // Setup default mock responses
  mockPrismaService.user.findFirst.mockResolvedValue({
    id: 'user-123',
    email: 'host@example.com',
    isActive: true,
    timezone: 'America/New_York',
  });
  
  mockPrismaService.meetingType.findFirst.mockResolvedValue({
    id: 'meeting-type-123',
    name: 'Test Meeting',
    duration: 30,
    hostId: 'user-123',
    isActive: true,
    requiresApproval: false,
    maxBookingsPerDay: null,
    requiredNoticeMinutes: 60,
  });
  
  mockPrismaService.booking.findMany.mockResolvedValue([]);
  mockPrismaService.booking.count.mockResolvedValue(0);
});
```

#### 4. **Fix Timezone Utility Tests**
**File: apps/api/src/common/utils/timezone.utils.spec.ts**

Fix the failing test on line 122:
```typescript
it('should respect slot duration', () => {
  const startTime = new Date('2024-01-15T09:00:00Z');
  const endTime = new Date('2024-01-15T10:00:00Z');
  const slotDuration = 30; // 30 minutes
  
  const slots = TimezoneUtils.generateTimeSlots(startTime, endTime, slotDuration);
  
  // Should generate 2 slots: 09:00-09:30 and 09:30-10:00
  expect(slots.length).toBe(2);
  
  const firstSlot = slots[0];
  const duration = (firstSlot.endTime.getTime() - firstSlot.startTime.getTime()) / (1000 * 60);
  expect(duration).toBe(30);
  
  const secondSlot = slots[1];
  expect(secondSlot.startTime).toEqual(firstSlot.endTime);
});
```

### Day 3: Security Fixes

#### 5. **Implement JWT Token Blacklisting**
**File: apps/api/src/auth/auth.service.ts**

Add blacklisting methods:
```typescript
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class AuthService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    // ... other dependencies
  ) {}

  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    const ttl = expiresIn * 1000; // Convert to milliseconds
    await this.cacheManager.set(`blacklist:${token}`, 'true', ttl);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.cacheManager.get(`blacklist:${token}`);
    return !!result;
  }

  async logout(token: string): Promise<{ message: string }> {
    // Decode token to get expiry
    const decoded = this.jwtService.decode(token) as any;
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
    
    // Blacklist the token
    await this.blacklistToken(token, expiresIn);
    
    return { message: 'Logged out successfully' };
  }
}
```

**File: apps/api/src/auth/strategies/jwt.strategy.ts**

Update to check blacklist:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    
    // Check if token is blacklisted
    if (await this.authService.isTokenBlacklisted(token)) {
      throw new UnauthorizedException('Token has been revoked');
    }
    
    return { userId: payload.sub, email: payload.email };
  }
}
```

#### 6. **Encrypt Calendar Tokens**
**File: apps/api/src/calendar-integrations/calendar-integrations.service.ts**

Add encryption for stored tokens:
```typescript
import * as crypto from 'crypto';

@Injectable()
export class CalendarIntegrationsService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipher(this.algorithm, this.key);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async saveIntegration(userId: string, provider: string, tokens: any) {
    const encryptedAccessToken = this.encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token 
      ? this.encrypt(tokens.refresh_token) 
      : null;

    return this.prisma.calendarIntegration.create({
      data: {
        userId,
        provider,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        // ... other fields
      },
    });
  }
}
```

### Day 4: Database Performance

#### 7. **Add Critical Database Indexes**
**Create migration file: apps/api/prisma/migrations/add_performance_indexes.sql**

```sql
-- Booking performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_host_date 
ON bookings(host_id, start_time) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_meeting_type_date 
ON bookings(meeting_type_id, start_time) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_status_date 
ON bookings(status, start_time) 
WHERE deleted_at IS NULL;

-- Availability performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_availability_user_day 
ON availability(user_id, day_of_week) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_availability_user_date 
ON availability(user_id, specific_date) 
WHERE deleted_at IS NULL AND specific_date IS NOT NULL;

-- Calendar integration indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_integrations_user_active 
ON calendar_integrations(user_id, is_active) 
WHERE deleted_at IS NULL;

-- Meeting type indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meeting_types_org_active 
ON meeting_types(organization_id, is_active) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meeting_types_host_active 
ON meeting_types(host_id, is_active) 
WHERE deleted_at IS NULL;

-- Organization member indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_members_user_org 
ON organization_members(user_id, organization_id);

-- User lookup indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_active 
ON users(email) 
WHERE is_active = true AND deleted_at IS NULL;

-- Add query performance statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### Day 5: Error Handling & Validation

#### 8. **Global Exception Filter**
**File: apps/api/src/common/filters/global-exception.filter.ts**

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();
      
      if (typeof errorResponse === 'object') {
        message = (errorResponse as any).message || exception.message;
        details = (errorResponse as any).errors;
      } else {
        message = errorResponse as string;
      }
    } else if (exception instanceof PrismaClientKnownRequestError) {
      status = HttpStatus.BAD_REQUEST;
      message = this.handlePrismaError(exception);
    }

    // Log error with context
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(details && { details }),
      ...(process.env.NODE_ENV === 'development' && {
        stack: exception instanceof Error ? exception.stack : undefined,
      }),
    };

    response.status(status).json(errorResponse);
  }

  private handlePrismaError(error: PrismaClientKnownRequestError): string {
    switch (error.code) {
      case 'P2002':
        return 'A record with this information already exists';
      case 'P2014':
        return 'The change you are trying to make would violate a relation';
      case 'P2003':
        return 'Foreign key constraint failed';
      case 'P2025':
        return 'Record not found';
      default:
        return 'Database error occurred';
    }
  }
}
```

### Day 6-7: Testing & Deployment

#### 9. **Run All Tests and Fix Issues**
```bash
# Run tests with coverage
cd apps/api
npm run test:cov

# Target: >90% test coverage
# Fix any remaining failing tests
```

#### 10. **Performance Testing**
```bash
# Install performance testing tools
npm install -g artillery

# Create performance test config
# artillery-config.yml
```

**artillery-config.yml:**
```yaml
config:
  target: 'http://localhost:3001'
  phases:
    - duration: 60
      arrivalRate: 10
  defaults:
    headers:
      Authorization: 'Bearer test-token'

scenarios:
  - name: "Booking API Load Test"
    flow:
      - get:
          url: "/api/v1/public/meeting-types"
      - post:
          url: "/api/v1/public/bookings"
          json:
            meetingTypeId: "test-id"
            startTime: "2025-09-02T10:00:00Z"
            endTime: "2025-09-02T11:00:00Z"
            attendees:
              - email: "test@example.com"
                name: "Test User"
```

## 📋 IMPLEMENTATION CHECKLIST

### Week 1 (Days 1-3):
- [ ] ✅ Create proper logging service
- [ ] ✅ Replace all console.log statements
- [ ] ✅ Fix test suite (achieve >80% pass rate)
- [ ] ✅ Implement JWT blacklisting
- [ ] ✅ Encrypt stored tokens
- [ ] ✅ Add database indexes

### Week 2 (Days 4-7):
- [ ] ✅ Global exception filter
- [ ] ✅ Performance testing setup
- [ ] ✅ Security headers implementation
- [ ] ✅ API rate limiting
- [ ] ✅ Monitoring setup
- [ ] ✅ Documentation updates

## 🎯 SUCCESS CRITERIA

After implementing these fixes:

1. **Test Suite:** >90% tests passing (currently 66%)
2. **Performance:** API responses <300ms (currently ~500ms)
3. **Security:** No critical vulnerabilities in scan
4. **Logging:** Zero console.log in production code
5. **Database:** Query times <100ms average

## 🚀 DEPLOYMENT PLAN

1. **Development Branch:** Create `feature/critical-fixes`
2. **Testing:** Comprehensive testing in staging environment
3. **Code Review:** Peer review all changes
4. **Deployment:** Gradual rollout with monitoring
5. **Validation:** Performance and functionality testing

## ⚠️ RISK MITIGATION

1. **Database Migration:** Test indexes on staging first
2. **Token Encryption:** Gradual migration to avoid breaking existing integrations
3. **Logging Changes:** Monitor application performance during rollout
4. **Testing:** Maintain test environment parity with production

Execute this plan systematically over the next 2 weeks to address the most critical issues in the SchedulePro application.
