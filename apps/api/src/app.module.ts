import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';

// Core modules
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { OAuthModule } from './auth/oauth/oauth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MeetingTypesModule } from './meeting-types/meeting-types.module';
import { BookingsModule } from './bookings/bookings.module';
import { AvailabilityModule } from './availability/availability.module';
import { CalendarModule } from './calendar/calendar.module';
import { PublicModule } from './public/public.module';
import { EmailModule } from './email/email.module';

// Configuration imports
import { databaseConfig } from './config/database.config';
import { authConfig } from './config/auth.config';
import { cacheConfig } from './config/cache.config';
import { emailConfig } from './config/email.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, authConfig, cacheConfig, emailConfig],
      envFilePath: ['.env.local', '.env'],
    }),

    // Throttling/Rate limiting
    ThrottlerModule.forRoot({
      ttl: 60000, // 1 minute
      limit: 60, // 60 requests per minute
    }),

    // Caching
    CacheModule.register({
      isGlobal: true,
      ttl: 300, // 5 minutes default TTL
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Core modules
    HealthModule,
    CommonModule,
    DatabaseModule,
    
    // Feature modules
    AuthModule,
    OAuthModule,
    UsersModule,
    OrganizationsModule,
    MeetingTypesModule,
    BookingsModule,
    AvailabilityModule,
    CalendarModule,
    PublicModule,
    EmailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
