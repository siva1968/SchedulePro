import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface BookingMetrics {
  totalBookings: number;
  successfulBookings: number;
  failedBookings: number;
  averageProcessingTime: number;
  conflictRate: number;
  validationFailureRate: number;
  notificationSuccessRate: number;
}

export interface SystemHealthMetrics {
  apiResponseTime: number;
  databaseResponseTime: number;
  emailServiceHealth: boolean;
  calendarServiceHealth: boolean;
  activeConnections: number;
  errorRate: number;
}

export interface PerformanceMetrics {
  timezone: {
    avgProcessingTime: number;
    errorCount: number;
    operationCount: number;
  };
  conflictDetection: {
    avgProcessingTime: number;
    conflictsDetected: number;
    falsePositives: number;
  };
  validation: {
    avgProcessingTime: number;
    validationFailures: number;
    businessRuleViolations: number;
  };
  notifications: {
    totalSent: number;
    deliveryFailures: number;
    avgDeliveryTime: number;
  };
}

export interface MetricEvent {
  timestamp: Date;
  type: 'booking_created' | 'validation_failed' | 'conflict_detected' | 'notification_sent' | 'error_occurred';
  data: any;
  processingTime?: number;
  success: boolean;
  userId?: string;
  hostId?: string;
  meetingTypeId?: string;
}

@Injectable()
export class BookingMetricsService {
  private readonly logger = new Logger(BookingMetricsService.name);
  private metrics: MetricEvent[] = [];
  private readonly maxMetricsInMemory = 10000;

  constructor(private prisma: PrismaService) {}

  /**
   * Record a metric event
   */
  recordEvent(event: Omit<MetricEvent, 'timestamp'>): void {
    const metricEvent: MetricEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.metrics.push(metricEvent);

    // Keep only recent metrics in memory
    if (this.metrics.length > this.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.maxMetricsInMemory);
    }

    // Log significant events
    if (!event.success || event.type === 'error_occurred') {
      this.logger.warn('Metric event recorded', {
        type: event.type,
        success: event.success,
        processingTime: event.processingTime,
        data: event.data,
      });
    } else {
      this.logger.debug('Metric event recorded', {
        type: event.type,
        processingTime: event.processingTime,
      });
    }
  }

  /**
   * Get booking-related metrics
   */
  async getBookingMetrics(timeRange: { start: Date; end: Date }): Promise<BookingMetrics> {
    const events = this.getEventsInRange(timeRange);
    const bookingEvents = events.filter(e => e.type === 'booking_created');
    const validationEvents = events.filter(e => e.type === 'validation_failed');
    const conflictEvents = events.filter(e => e.type === 'conflict_detected');
    const notificationEvents = events.filter(e => e.type === 'notification_sent');

    const totalBookings = bookingEvents.length;
    const successfulBookings = bookingEvents.filter(e => e.success).length;
    const failedBookings = totalBookings - successfulBookings;

    const avgProcessingTime = bookingEvents.length > 0
      ? bookingEvents.reduce((sum, e) => sum + (e.processingTime || 0), 0) / bookingEvents.length
      : 0;

    const conflictRate = totalBookings > 0 ? conflictEvents.length / totalBookings : 0;
    const validationFailureRate = totalBookings > 0 ? validationEvents.length / totalBookings : 0;

    const successfulNotifications = notificationEvents.filter(e => e.success).length;
    const notificationSuccessRate = notificationEvents.length > 0
      ? successfulNotifications / notificationEvents.length
      : 1;

    return {
      totalBookings,
      successfulBookings,
      failedBookings,
      averageProcessingTime: Math.round(avgProcessingTime),
      conflictRate: Math.round(conflictRate * 100) / 100,
      validationFailureRate: Math.round(validationFailureRate * 100) / 100,
      notificationSuccessRate: Math.round(notificationSuccessRate * 100) / 100,
    };
  }

  /**
   * Get system health metrics
   */
  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    const startTime = Date.now();

    // Test database connection
    let databaseResponseTime = 0;
    try {
      const dbStart = Date.now();
      await this.prisma.user.count({ take: 1 });
      databaseResponseTime = Date.now() - dbStart;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      databaseResponseTime = -1;
    }

    const apiResponseTime = Date.now() - startTime;

    // Calculate error rate from recent events
    const recentEvents = this.getEventsInRange({
      start: new Date(Date.now() - 60 * 60 * 1000), // Last hour
      end: new Date(),
    });

    const totalEvents = recentEvents.length;
    const errorEvents = recentEvents.filter(e => !e.success).length;
    const errorRate = totalEvents > 0 ? errorEvents / totalEvents : 0;

    return {
      apiResponseTime,
      databaseResponseTime,
      emailServiceHealth: true, // Would check actual email service
      calendarServiceHealth: true, // Would check actual calendar service
      activeConnections: 0, // Would get from connection pool
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }

  /**
   * Get detailed performance metrics
   */
  getPerformanceMetrics(timeRange: { start: Date; end: Date }): PerformanceMetrics {
    const events = this.getEventsInRange(timeRange);

    // Timezone operations (simulated)
    const timezoneOps = events.filter(e => e.data?.operation === 'timezone_conversion');
    const avgTimezoneTime = timezoneOps.length > 0
      ? timezoneOps.reduce((sum, e) => sum + (e.processingTime || 0), 0) / timezoneOps.length
      : 0;

    // Conflict detection
    const conflictEvents = events.filter(e => e.type === 'conflict_detected');
    const conflictProcessingTimes = conflictEvents
      .filter(e => e.processingTime)
      .map(e => e.processingTime!);
    const avgConflictTime = conflictProcessingTimes.length > 0
      ? conflictProcessingTimes.reduce((sum, time) => sum + time, 0) / conflictProcessingTimes.length
      : 0;

    // Validation
    const validationEvents = events.filter(e => e.type === 'validation_failed');
    const validationProcessingTimes = validationEvents
      .filter(e => e.processingTime)
      .map(e => e.processingTime!);
    const avgValidationTime = validationProcessingTimes.length > 0
      ? validationProcessingTimes.reduce((sum, time) => sum + time, 0) / validationProcessingTimes.length
      : 0;

    // Notifications
    const notificationEvents = events.filter(e => e.type === 'notification_sent');
    const notificationFailures = notificationEvents.filter(e => !e.success).length;
    const notificationTimes = notificationEvents
      .filter(e => e.processingTime)
      .map(e => e.processingTime!);
    const avgNotificationTime = notificationTimes.length > 0
      ? notificationTimes.reduce((sum, time) => sum + time, 0) / notificationTimes.length
      : 0;

    return {
      timezone: {
        avgProcessingTime: Math.round(avgTimezoneTime),
        errorCount: timezoneOps.filter(e => !e.success).length,
        operationCount: timezoneOps.length,
      },
      conflictDetection: {
        avgProcessingTime: Math.round(avgConflictTime),
        conflictsDetected: conflictEvents.length,
        falsePositives: 0, // Would need additional tracking
      },
      validation: {
        avgProcessingTime: Math.round(avgValidationTime),
        validationFailures: validationEvents.length,
        businessRuleViolations: validationEvents.filter(e => 
          e.data?.reason?.includes('business rule')
        ).length,
      },
      notifications: {
        totalSent: notificationEvents.length,
        deliveryFailures: notificationFailures,
        avgDeliveryTime: Math.round(avgNotificationTime),
      },
    };
  }

  /**
   * Get top error types and their frequencies
   */
  getErrorAnalysis(timeRange: { start: Date; end: Date }): Array<{
    type: string;
    count: number;
    percentage: number;
    lastOccurrence: Date;
    sampleMessage: string;
  }> {
    const events = this.getEventsInRange(timeRange);
    const errorEvents = events.filter(e => !e.success);

    const errorTypeMap = new Map<string, {
      count: number;
      lastOccurrence: Date;
      sampleMessage: string;
    }>();

    errorEvents.forEach(event => {
      const errorType = event.data?.errorType || event.type;
      const existing = errorTypeMap.get(errorType);
      
      if (existing) {
        existing.count++;
        if (event.timestamp > existing.lastOccurrence) {
          existing.lastOccurrence = event.timestamp;
          existing.sampleMessage = event.data?.message || 'No message';
        }
      } else {
        errorTypeMap.set(errorType, {
          count: 1,
          lastOccurrence: event.timestamp,
          sampleMessage: event.data?.message || 'No message',
        });
      }
    });

    const totalErrors = errorEvents.length;
    return Array.from(errorTypeMap.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        percentage: totalErrors > 0 ? Math.round((data.count / totalErrors) * 100) : 0,
        lastOccurrence: data.lastOccurrence,
        sampleMessage: data.sampleMessage,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get host performance metrics
   */
  async getHostMetrics(hostId: string, timeRange: { start: Date; end: Date }): Promise<{
    bookingCount: number;
    averageProcessingTime: number;
    validationFailureRate: number;
    conflictRate: number;
    notificationSuccessRate: number;
  }> {
    const events = this.getEventsInRange(timeRange).filter(e => e.hostId === hostId);
    
    const bookingEvents = events.filter(e => e.type === 'booking_created');
    const validationEvents = events.filter(e => e.type === 'validation_failed');
    const conflictEvents = events.filter(e => e.type === 'conflict_detected');
    const notificationEvents = events.filter(e => e.type === 'notification_sent');

    const bookingCount = bookingEvents.length;
    const avgProcessingTime = bookingEvents.length > 0
      ? bookingEvents.reduce((sum, e) => sum + (e.processingTime || 0), 0) / bookingEvents.length
      : 0;

    const validationFailureRate = bookingCount > 0 ? validationEvents.length / bookingCount : 0;
    const conflictRate = bookingCount > 0 ? conflictEvents.length / bookingCount : 0;

    const successfulNotifications = notificationEvents.filter(e => e.success).length;
    const notificationSuccessRate = notificationEvents.length > 0
      ? successfulNotifications / notificationEvents.length
      : 1;

    return {
      bookingCount,
      averageProcessingTime: Math.round(avgProcessingTime),
      validationFailureRate: Math.round(validationFailureRate * 100) / 100,
      conflictRate: Math.round(conflictRate * 100) / 100,
      notificationSuccessRate: Math.round(notificationSuccessRate * 100) / 100,
    };
  }

  /**
   * Get real-time system status
   */
  getRealTimeStatus(): {
    currentLoad: number;
    activeOperations: number;
    errorRate: number;
    averageResponseTime: number;
    status: 'healthy' | 'warning' | 'critical';
  } {
    const lastMinute = new Date(Date.now() - 60 * 1000);
    const recentEvents = this.metrics.filter(e => e.timestamp > lastMinute);

    const totalEvents = recentEvents.length;
    const errorEvents = recentEvents.filter(e => !e.success).length;
    const errorRate = totalEvents > 0 ? errorEvents / totalEvents : 0;

    const responseTimes = recentEvents
      .filter(e => e.processingTime)
      .map(e => e.processingTime!);
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (errorRate > 0.2) status = 'critical';
    else if (errorRate > 0.1 || avgResponseTime > 5000) status = 'warning';

    return {
      currentLoad: Math.min(100, totalEvents * 2), // Simulated load calculation
      activeOperations: recentEvents.length,
      errorRate: Math.round(errorRate * 100) / 100,
      averageResponseTime: Math.round(avgResponseTime),
      status,
    };
  }

  /**
   * Generate metrics report
   */
  async generateMetricsReport(timeRange: { start: Date; end: Date }): Promise<{
    summary: BookingMetrics;
    performance: PerformanceMetrics;
    systemHealth: SystemHealthMetrics;
    errorAnalysis: Array<{ type: string; count: number; percentage: number }>;
    recommendations: string[];
  }> {
    const [summary, performance, systemHealth, errorAnalysis] = await Promise.all([
      this.getBookingMetrics(timeRange),
      this.getPerformanceMetrics(timeRange),
      this.getSystemHealthMetrics(),
      this.getErrorAnalysis(timeRange),
    ]);

    const recommendations = this.generateRecommendations(summary, performance, systemHealth);

    return {
      summary,
      performance,
      systemHealth,
      errorAnalysis: errorAnalysis.slice(0, 10), // Top 10 errors
      recommendations,
    };
  }

  /**
   * Log performance timing
   */
  logPerformance(operation: string, startTime: number, success = true, metadata?: any): void {
    const processingTime = Date.now() - startTime;
    
    this.recordEvent({
      type: success ? 'booking_created' : 'error_occurred',
      data: { operation, ...metadata },
      processingTime,
      success,
    });

    if (processingTime > 5000) {
      this.logger.warn('Slow operation detected', {
        operation,
        processingTime,
        metadata,
      });
    }
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(olderThan: Date): void {
    const initialCount = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp > olderThan);
    const removedCount = initialCount - this.metrics.length;
    
    if (removedCount > 0) {
      this.logger.log(`Cleared ${removedCount} old metrics`);
    }
  }

  /**
   * Helper methods
   */
  private getEventsInRange(timeRange: { start: Date; end: Date }): MetricEvent[] {
    return this.metrics.filter(
      event => event.timestamp >= timeRange.start && event.timestamp <= timeRange.end
    );
  }

  private generateRecommendations(
    summary: BookingMetrics,
    performance: PerformanceMetrics,
    systemHealth: SystemHealthMetrics
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (summary.averageProcessingTime > 3000) {
      recommendations.push('Consider optimizing booking processing time - currently averaging ' + summary.averageProcessingTime + 'ms');
    }

    if (summary.conflictRate > 0.1) {
      recommendations.push('High conflict rate detected (' + (summary.conflictRate * 100).toFixed(1) + '%) - review availability settings');
    }

    if (summary.validationFailureRate > 0.15) {
      recommendations.push('High validation failure rate (' + (summary.validationFailureRate * 100).toFixed(1) + '%) - review business rules');
    }

    if (summary.notificationSuccessRate < 0.95) {
      recommendations.push('Notification delivery issues detected - check email service configuration');
    }

    // System health recommendations
    if (systemHealth.databaseResponseTime > 1000) {
      recommendations.push('Database response time is slow (' + systemHealth.databaseResponseTime + 'ms) - consider optimization');
    }

    if (systemHealth.errorRate > 0.05) {
      recommendations.push('Error rate is elevated (' + (systemHealth.errorRate * 100).toFixed(1) + '%) - investigate recent issues');
    }

    // Performance-specific recommendations
    if (performance.conflictDetection.avgProcessingTime > 2000) {
      recommendations.push('Conflict detection is slow - consider caching or optimization');
    }

    if (performance.notifications.deliveryFailures > performance.notifications.totalSent * 0.1) {
      recommendations.push('High notification failure rate - check email service health');
    }

    return recommendations;
  }
}
