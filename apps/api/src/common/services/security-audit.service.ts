import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGIN_BLOCKED = 'LOGIN_BLOCKED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TWO_FACTOR_SUCCESS = 'TWO_FACTOR_SUCCESS',
  TWO_FACTOR_FAILED = 'TWO_FACTOR_FAILED',
  OAUTH_LOGIN_SUCCESS = 'OAUTH_LOGIN_SUCCESS',
  OAUTH_LOGIN_FAILED = 'OAUTH_LOGIN_FAILED',
  REGISTRATION_SUCCESS = 'REGISTRATION_SUCCESS',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  EMAIL_VERIFICATION_SUCCESS = 'EMAIL_VERIFICATION_SUCCESS',
  EMAIL_VERIFICATION_FAILED = 'EMAIL_VERIFICATION_FAILED',
}

export interface SecurityEventData {
  eventType: SecurityEventType;
  userId?: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
  requestId?: string;
  additionalData?: Record<string, any>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);
  private readonly enableDatabaseLogging: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.enableDatabaseLogging = this.configService.get('ENABLE_SECURITY_AUDIT_DB', 'true') === 'true';
  }

  async logSecurityEvent(eventData: SecurityEventData): Promise<void> {
    try {
      // Always log to application logger
      const logMessage = this.formatLogMessage(eventData);
      
      switch (eventData.riskLevel) {
        case 'CRITICAL':
          this.logger.error(`🚨 CRITICAL SECURITY EVENT: ${logMessage}`);
          break;
        case 'HIGH':
          this.logger.warn(`⚠️ HIGH RISK SECURITY EVENT: ${logMessage}`);
          break;
        case 'MEDIUM':
          this.logger.warn(`🔍 MEDIUM RISK SECURITY EVENT: ${logMessage}`);
          break;
        case 'LOW':
          this.logger.log(`ℹ️ SECURITY EVENT: ${logMessage}`);
          break;
      }

      // Log to database if enabled and connection is available
      if (this.enableDatabaseLogging) {
        await this.logToDatabase(eventData);
      }

      // For critical events, consider additional notifications
      if (eventData.riskLevel === 'CRITICAL') {
        await this.handleCriticalEvent(eventData);
      }

    } catch (error) {
      this.logger.error('Failed to log security event:', error);
      // Fallback to simple console logging
      console.error('SECURITY EVENT LOGGING FAILED:', {
        event: eventData,
        error: error.message,
      });
    }
  }

  private formatLogMessage(eventData: SecurityEventData): string {
    const parts = [
      `Event: ${eventData.eventType}`,
      `IP: ${eventData.ipAddress}`,
    ];

    if (eventData.userId) {
      parts.push(`UserID: ${eventData.userId}`);
    }

    if (eventData.email) {
      parts.push(`Email: ${eventData.email}`);
    }

    if (eventData.requestId) {
      parts.push(`ReqID: ${eventData.requestId}`);
    }

    if (eventData.additionalData) {
      parts.push(`Data: ${JSON.stringify(eventData.additionalData)}`);
    }

    return parts.join(' | ');
  }

  private async logToDatabase(eventData: SecurityEventData): Promise<void> {
    try {
      // Check if database is healthy before attempting to log
      const isHealthy = await this.prisma.isHealthy();
      if (!isHealthy) {
        this.logger.warn('Database unhealthy, skipping security audit database logging');
        return;
      }

      await this.prisma.$executeRaw`
        INSERT INTO security_audit_logs (
          event_type, user_id, email, ip_address, user_agent, 
          request_id, additional_data, risk_level, created_at
        ) VALUES (
          ${eventData.eventType},
          ${eventData.userId || null},
          ${eventData.email || null},
          ${eventData.ipAddress},
          ${eventData.userAgent},
          ${eventData.requestId || null},
          ${JSON.stringify(eventData.additionalData || {})},
          ${eventData.riskLevel},
          NOW()
        )
      `;
    } catch (error) {
      this.logger.warn('Failed to log security event to database:', error.message);
      // Don't throw error to prevent blocking the main application flow
    }
  }

  private async handleCriticalEvent(eventData: SecurityEventData): Promise<void> {
    // For critical events, you might want to:
    // 1. Send immediate notifications to admins
    // 2. Block the IP address temporarily
    // 3. Lock the user account
    // 4. Trigger additional security measures

    this.logger.error(`CRITICAL SECURITY EVENT DETECTED: ${eventData.eventType}`, {
      event: eventData,
      timestamp: new Date().toISOString(),
    });

    // Example: Auto-lock account for critical login attempts
    if (eventData.eventType === SecurityEventType.SUSPICIOUS_ACTIVITY && eventData.userId) {
      try {
        await this.autoLockUserAccount(eventData.userId, 'Suspicious activity detected');
      } catch (error) {
        this.logger.error('Failed to auto-lock user account:', error);
      }
    }
  }

  private async autoLockUserAccount(userId: string, reason: string): Promise<void> {
    try {
      // Use existing fields - set isActive to false
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          // Store lock reason in a way that can be retrieved
          // You might want to add a separate table for account locks
        },
      });

      this.logger.warn(`User account ${userId} auto-locked due to: ${reason}`);
      
      // Also log this as a security event
      await this.logSecurityEvent({
        eventType: SecurityEventType.ACCOUNT_LOCKED,
        userId,
        ipAddress: 'system',
        userAgent: 'security-service',
        additionalData: { reason, lockedBy: 'auto-security-system' },
        riskLevel: 'HIGH',
      });
    } catch (error) {
      this.logger.error(`Failed to auto-lock user ${userId}:`, error);
    }
  }

  // Helper methods for common security events
  async logLoginAttempt(
    email: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    userId?: string,
    requestId?: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: success ? SecurityEventType.LOGIN_SUCCESS : SecurityEventType.LOGIN_FAILED,
      userId,
      email,
      ipAddress,
      userAgent,
      requestId,
      additionalData,
      riskLevel: success ? 'LOW' : 'MEDIUM',
    });
  }

  async logPasswordReset(
    email: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    requestId?: string
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: success ? SecurityEventType.PASSWORD_RESET_SUCCESS : SecurityEventType.PASSWORD_RESET_REQUESTED,
      email,
      ipAddress,
      userAgent,
      requestId,
      riskLevel: 'MEDIUM',
    });
  }

  async logSuspiciousActivity(
    description: string,
    ipAddress: string,
    userAgent: string,
    userId?: string,
    email?: string,
    requestId?: string
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
      userId,
      email,
      ipAddress,
      userAgent,
      requestId,
      additionalData: { description },
      riskLevel: 'HIGH',
    });
  }

  // Get security event statistics
  async getSecurityEventStats(timeRange: 'hour' | 'day' | 'week' | 'month' = 'day'): Promise<any> {
    try {
      const isHealthy = await this.prisma.isHealthy();
      if (!isHealthy) {
        return { error: 'Database unavailable' };
      }

      const timeFilter = this.getTimeFilter(timeRange);
      
      const stats = await this.prisma.$queryRaw`
        SELECT 
          event_type,
          risk_level,
          COUNT(*) as count,
          COUNT(DISTINCT ip_address) as unique_ips
        FROM security_audit_logs 
        WHERE created_at >= ${timeFilter}
        GROUP BY event_type, risk_level
        ORDER BY count DESC
      `;

      return stats;
    } catch (error) {
      this.logger.error('Failed to get security event stats:', error);
      return { error: 'Failed to retrieve stats' };
    }
  }

  private getTimeFilter(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case 'hour':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
}
