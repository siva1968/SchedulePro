import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentConfigService } from '../config/environment-config.service';
import { PrismaService } from '../database/prisma.service';

export interface HealthResult {
  status: 'ok' | 'error';
  details: Record<string, any>;
  error?: string;
}

@Injectable()
export class ApplicationHealthIndicator {
  private readonly logger = new Logger(ApplicationHealthIndicator.name);

  constructor(
    private readonly environmentConfig: EnvironmentConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async checkHealth(): Promise<HealthResult> {
    try {
      // Check environment configuration
      const configValidation = this.environmentConfig.validateRequiredConfigs();
      if (!configValidation.valid) {
        throw new Error(`Missing required environment variables: ${configValidation.missing.join(', ')}`);
      }

      // Check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;

      // Check authentication setup
      const authConfig = {
        hasJwtSecret: !!this.environmentConfig.jwtSecret,
        hasRefreshTokenSecret: !!this.environmentConfig.refreshTokenSecret,
        hasEncryptionKey: !!this.environmentConfig.encryptionKey,
        hasCalendarEncryptionKey: !!this.environmentConfig.calendarEncryptionKey,
      };

      if (!authConfig.hasJwtSecret || !authConfig.hasRefreshTokenSecret || 
          !authConfig.hasEncryptionKey || !authConfig.hasCalendarEncryptionKey) {
        throw new Error('Authentication configuration incomplete');
      }

      // Check email configuration
      const emailConfig = this.environmentConfig.getEmailConfig();
      if (!emailConfig.enabled) {
        this.logger.warn('Email configuration not complete - some features may not work');
      }

      // Check OAuth configuration
      const hasGoogleOAuth = this.environmentConfig.hasGoogleOAuth;
      const hasMicrosoftOAuth = this.environmentConfig.hasMicrosoftOAuth;

      if (!hasGoogleOAuth && !hasMicrosoftOAuth) {
        this.logger.warn('No OAuth providers configured - social login will not work');
      }

      const details = {
        environment: this.environmentConfig.nodeEnv,
        database: 'connected',
        authentication: 'configured',
        email: emailConfig.enabled ? 'configured' : 'incomplete',
        oauth: {
          google: hasGoogleOAuth ? 'configured' : 'not configured',
          microsoft: hasMicrosoftOAuth ? 'configured' : 'not configured',
        },
        features: {
          redis: this.environmentConfig.hasRedis ? 'available' : 'not available',
          calendar: 'configured',
        },
      };

      this.logger.log('Application health check passed');
      return {
        status: 'ok',
        details,
      };

    } catch (error) {
      this.logger.error('Application health check failed', error.stack);
      return {
        status: 'error',
        details: {},
        error: error.message,
      };
    }
  }

  async checkDatabaseSchema(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check if essential tables exist by querying them
      const tableChecks = [
        { name: 'User', query: () => this.prisma.user.findFirst() },
        { name: 'Organization', query: () => this.prisma.organization.findFirst() },
        { name: 'MeetingType', query: () => this.prisma.meetingType.findFirst() },
        { name: 'Booking', query: () => this.prisma.booking.findFirst() },
        { name: 'Availability', query: () => this.prisma.availability.findFirst() },
        { name: 'CalendarIntegration', query: () => this.prisma.calendarIntegration.findFirst() },
      ];

      for (const table of tableChecks) {
        try {
          await table.query();
        } catch (error) {
          issues.push(`Table ${table.name} does not exist or is not accessible: ${error.message}`);
        }
      }

      // Check for essential admin user (if User table exists)
      try {
        const adminCount = await this.prisma.user.count({
          where: { 
            email: { contains: 'admin' } // Basic check for admin user
          },
        });

        if (adminCount === 0) {
          issues.push('No admin user found - application setup may be incomplete');
        }
      } catch (error) {
        issues.push(`Admin user check failed: ${error.message}`);
      }

      return {
        valid: issues.length === 0,
        issues,
      };

    } catch (error) {
      issues.push(`Database schema check failed: ${error.message}`);
      return {
        valid: false,
        issues,
      };
    }
  }

  async getApplicationInfo(): Promise<Record<string, any>> {
    try {
      const config = this.environmentConfig.getAllConfig();
      const schemaCheck = await this.checkDatabaseSchema();

      // Count essential entities
      let userCount = 0, orgCount = 0, meetingTypeCount = 0, bookingCount = 0;

      try {
        [userCount, orgCount, meetingTypeCount, bookingCount] = await Promise.all([
          this.prisma.user.count(),
          this.prisma.organization.count(),
          this.prisma.meetingType.count(),
          this.prisma.booking.count(),
        ]);
      } catch (error) {
        this.logger.warn('Could not count entities - database schema may be incomplete');
      }

      return {
        application: {
          name: 'SchedulePro API',
          version: '1.0.0',
          environment: config.environment.nodeEnv,
          status: 'running',
        },
        configuration: config,
        database: {
          status: 'connected',
          schema: schemaCheck,
          entities: {
            users: userCount,
            organizations: orgCount,
            meetingTypes: meetingTypeCount,
            bookings: bookingCount,
          },
        },
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      this.logger.error('Failed to get application info', error.stack);
      return {
        application: {
          name: 'SchedulePro API',
          status: 'error',
          error: error.message,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
