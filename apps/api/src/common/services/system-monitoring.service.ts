import { Injectable, Logger } from '@nestjs/common';
import { BookingMetricsService } from './booking-metrics.service';
import { EnhancedLoggingService } from './enhanced-logging.service';

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  message: string;
  details?: any;
  responseTime?: number;
}

export interface SystemStatus {
  overall: 'healthy' | 'warning' | 'critical';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  checks: HealthCheck[];
}

export interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  lastTriggered?: Date;
}

export interface Alert {
  id: string;
  rule: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: any;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

@Injectable()
export class SystemMonitoringService {
  private readonly logger = new Logger(SystemMonitoringService.name);
  private readonly startTime = Date.now();
  private readonly alerts: Alert[] = [];
  private readonly maxAlerts = 1000;
  
  private readonly alertRules: AlertRule[] = [
    {
      name: 'High Error Rate',
      condition: 'error_rate > threshold',
      threshold: 0.05, // 5%
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 5,
    },
    {
      name: 'Critical Error Rate',
      condition: 'error_rate > threshold',
      threshold: 0.15, // 15%
      severity: 'critical',
      enabled: true,
      cooldownMinutes: 2,
    },
    {
      name: 'Slow Response Time',
      condition: 'avg_response_time > threshold',
      threshold: 5000, // 5 seconds
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 10,
    },
    {
      name: 'Very Slow Response Time',
      condition: 'avg_response_time > threshold',
      threshold: 10000, // 10 seconds
      severity: 'critical',
      enabled: true,
      cooldownMinutes: 5,
    },
    {
      name: 'High Conflict Rate',
      condition: 'conflict_rate > threshold',
      threshold: 0.20, // 20%
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 15,
    },
    {
      name: 'Database Slow Response',
      condition: 'db_response_time > threshold',
      threshold: 2000, // 2 seconds
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 5,
    },
    {
      name: 'Notification Failure Rate',
      condition: 'notification_failure_rate > threshold',
      threshold: 0.10, // 10%
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 10,
    },
    {
      name: 'Memory Usage High',
      condition: 'memory_usage > threshold',
      threshold: 85, // 85%
      severity: 'warning',
      enabled: true,
      cooldownMinutes: 5,
    },
  ];

  constructor(
    private metricsService: BookingMetricsService,
    private loggingService: EnhancedLoggingService,
  ) {
    // Start monitoring checks
    this.startPeriodicChecks();
  }

  /**
   * Get overall system status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const checks = await this.runAllHealthChecks();
    
    const criticalChecks = checks.filter(c => c.status === 'critical');
    const warningChecks = checks.filter(c => c.status === 'warning');
    
    let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalChecks.length > 0) {
      overall = 'critical';
    } else if (warningChecks.length > 0) {
      overall = 'warning';
    }

    return {
      overall,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
    };
  }

  /**
   * Run all health checks
   */
  async runAllHealthChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = [];

    // Database health check
    checks.push(await this.checkDatabase());
    
    // Metrics health check
    checks.push(await this.checkMetrics());
    
    // Memory usage check
    checks.push(this.checkMemoryUsage());
    
    // Disk space check
    checks.push(this.checkDiskSpace());
    
    // API response time check
    checks.push(await this.checkApiResponseTime());
    
    // Error rate check
    checks.push(await this.checkErrorRate());
    
    // Notification service check
    checks.push(await this.checkNotificationService());

    return checks;
  }

  /**
   * Individual health checks
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const systemHealth = await this.metricsService.getSystemHealthMetrics();
      const responseTime = Date.now() - startTime;
      
      if (systemHealth.databaseResponseTime === -1) {
        return {
          name: 'Database',
          status: 'critical',
          message: 'Database connection failed',
          responseTime,
        };
      } else if (systemHealth.databaseResponseTime > 2000) {
        return {
          name: 'Database',
          status: 'warning',
          message: `Database response time is slow: ${systemHealth.databaseResponseTime}ms`,
          responseTime,
        };
      } else {
        return {
          name: 'Database',
          status: 'healthy',
          message: `Database responsive: ${systemHealth.databaseResponseTime}ms`,
          responseTime,
        };
      }
    } catch (error) {
      return {
        name: 'Database',
        status: 'critical',
        message: 'Database health check failed',
        details: error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  private async checkMetrics(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const metrics = await this.metricsService.getBookingMetrics({
        start: oneHourAgo,
        end: now,
      });
      
      const responseTime = Date.now() - startTime;
      
      if (metrics.averageProcessingTime > 10000) {
        return {
          name: 'Metrics',
          status: 'critical',
          message: `Very slow processing time: ${metrics.averageProcessingTime}ms`,
          details: metrics,
          responseTime,
        };
      } else if (metrics.averageProcessingTime > 5000) {
        return {
          name: 'Metrics',
          status: 'warning',
          message: `Slow processing time: ${metrics.averageProcessingTime}ms`,
          details: metrics,
          responseTime,
        };
      } else {
        return {
          name: 'Metrics',
          status: 'healthy',
          message: `Metrics collection working: ${metrics.totalBookings} bookings processed`,
          details: metrics,
          responseTime,
        };
      }
    } catch (error) {
      return {
        name: 'Metrics',
        status: 'critical',
        message: 'Metrics collection failed',
        details: error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  private checkMemoryUsage(): HealthCheck {
    const startTime = Date.now();
    const memUsage = process.memoryUsage();
    const totalMem = memUsage.heapTotal;
    const usedMem = memUsage.heapUsed;
    const usagePercent = (usedMem / totalMem) * 100;
    
    const responseTime = Date.now() - startTime;
    
    if (usagePercent > 90) {
      return {
        name: 'Memory',
        status: 'critical',
        message: `Critical memory usage: ${usagePercent.toFixed(1)}%`,
        details: memUsage,
        responseTime,
      };
    } else if (usagePercent > 80) {
      return {
        name: 'Memory',
        status: 'warning',
        message: `High memory usage: ${usagePercent.toFixed(1)}%`,
        details: memUsage,
        responseTime,
      };
    } else {
      return {
        name: 'Memory',
        status: 'healthy',
        message: `Memory usage normal: ${usagePercent.toFixed(1)}%`,
        details: memUsage,
        responseTime,
      };
    }
  }

  private checkDiskSpace(): HealthCheck {
    const startTime = Date.now();
    // Simulated disk space check - would use actual fs operations in production
    const freeSpacePercent = 75; // Simulated
    const responseTime = Date.now() - startTime;
    
    if (freeSpacePercent < 10) {
      return {
        name: 'Disk Space',
        status: 'critical',
        message: `Critical disk space: ${freeSpacePercent}% free`,
        responseTime,
      };
    } else if (freeSpacePercent < 20) {
      return {
        name: 'Disk Space',
        status: 'warning',
        message: `Low disk space: ${freeSpacePercent}% free`,
        responseTime,
      };
    } else {
      return {
        name: 'Disk Space',
        status: 'healthy',
        message: `Disk space adequate: ${freeSpacePercent}% free`,
        responseTime,
      };
    }
  }

  private async checkApiResponseTime(): Promise<HealthCheck> {
    const startTime = Date.now();
    const realTimeStatus = this.metricsService.getRealTimeStatus();
    const responseTime = Date.now() - startTime;
    
    if (realTimeStatus.averageResponseTime > 10000) {
      return {
        name: 'API Response',
        status: 'critical',
        message: `Very slow API response: ${realTimeStatus.averageResponseTime}ms`,
        details: realTimeStatus,
        responseTime,
      };
    } else if (realTimeStatus.averageResponseTime > 5000) {
      return {
        name: 'API Response',
        status: 'warning',
        message: `Slow API response: ${realTimeStatus.averageResponseTime}ms`,
        details: realTimeStatus,
        responseTime,
      };
    } else {
      return {
        name: 'API Response',
        status: 'healthy',
        message: `API response time good: ${realTimeStatus.averageResponseTime}ms`,
        details: realTimeStatus,
        responseTime,
      };
    }
  }

  private async checkErrorRate(): Promise<HealthCheck> {
    const startTime = Date.now();
    const realTimeStatus = this.metricsService.getRealTimeStatus();
    const responseTime = Date.now() - startTime;
    
    if (realTimeStatus.errorRate > 0.15) {
      return {
        name: 'Error Rate',
        status: 'critical',
        message: `Critical error rate: ${(realTimeStatus.errorRate * 100).toFixed(1)}%`,
        details: realTimeStatus,
        responseTime,
      };
    } else if (realTimeStatus.errorRate > 0.05) {
      return {
        name: 'Error Rate',
        status: 'warning',
        message: `Elevated error rate: ${(realTimeStatus.errorRate * 100).toFixed(1)}%`,
        details: realTimeStatus,
        responseTime,
      };
    } else {
      return {
        name: 'Error Rate',
        status: 'healthy',
        message: `Error rate normal: ${(realTimeStatus.errorRate * 100).toFixed(1)}%`,
        details: realTimeStatus,
        responseTime,
      };
    }
  }

  private async checkNotificationService(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      // Simulated notification service check
      const isHealthy = true; // Would check actual service
      const responseTime = Date.now() - startTime;
      
      if (isHealthy) {
        return {
          name: 'Notifications',
          status: 'healthy',
          message: 'Notification service operational',
          responseTime,
        };
      } else {
        return {
          name: 'Notifications',
          status: 'critical',
          message: 'Notification service unavailable',
          responseTime,
        };
      }
    } catch (error) {
      return {
        name: 'Notifications',
        status: 'critical',
        message: 'Notification service check failed',
        details: error.message,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Alert management
   */
  checkAlertRules(): void {
    const realTimeStatus = this.metricsService.getRealTimeStatus();
    
    // Check each alert rule
    this.alertRules.forEach(rule => {
      if (!rule.enabled) return;
      
      // Check cooldown
      if (rule.lastTriggered) {
        const cooldownEnd = new Date(rule.lastTriggered.getTime() + rule.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) return;
      }
      
      let shouldTrigger = false;
      let value: number;
      let message: string;
      
      // Evaluate rule conditions
      switch (rule.condition) {
        case 'error_rate > threshold':
          value = realTimeStatus.errorRate;
          shouldTrigger = value > rule.threshold;
          message = `Error rate ${(value * 100).toFixed(1)}% exceeds threshold ${(rule.threshold * 100).toFixed(1)}%`;
          break;
          
        case 'avg_response_time > threshold':
          value = realTimeStatus.averageResponseTime;
          shouldTrigger = value > rule.threshold;
          message = `Average response time ${value}ms exceeds threshold ${rule.threshold}ms`;
          break;
          
        default:
          return;
      }
      
      if (shouldTrigger) {
        this.triggerAlert(rule, message, { value, threshold: rule.threshold });
      }
    });
  }

  private triggerAlert(rule: AlertRule, message: string, details: any): void {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      rule: rule.name,
      severity: rule.severity,
      message,
      details,
      timestamp: new Date(),
      acknowledged: false,
    };
    
    this.alerts.push(alert);
    
    // Keep only recent alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.splice(0, this.alerts.length - this.maxAlerts);
    }
    
    // Update rule
    rule.lastTriggered = new Date();
    
    // Log the alert
    this.loggingService.error(`Alert triggered: ${rule.name}`, new Error(message), {
      operation: 'alert',
      alertId: alert.id,
      severity: rule.severity,
      details,
    });
    
    this.logger.warn(`Alert triggered: ${rule.name} - ${message}`, details);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get all alerts
   */
  getAllAlerts(limit = 100): Alert[] {
    return this.alerts
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date();
      
      this.loggingService.log(`Alert acknowledged: ${alert.rule}`, {
        operation: 'alert_acknowledge',
        alertId,
        acknowledgedBy,
      });
      
      return true;
    }
    return false;
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(timeRange?: { start: Date; end: Date }): {
    total: number;
    bySeverity: Record<string, number>;
    byRule: Record<string, number>;
    acknowledgedCount: number;
    averageResponseTime: number;
  } {
    let alerts = this.alerts;
    
    if (timeRange) {
      alerts = alerts.filter(alert =>
        alert.timestamp >= timeRange.start && alert.timestamp <= timeRange.end
      );
    }
    
    const bySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const byRule = alerts.reduce((acc, alert) => {
      acc[alert.rule] = (acc[alert.rule] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const acknowledgedAlerts = alerts.filter(a => a.acknowledged);
    const acknowledgedCount = acknowledgedAlerts.length;
    
    const responseTimes = acknowledgedAlerts
      .filter(a => a.acknowledgedAt)
      .map(a => a.acknowledgedAt!.getTime() - a.timestamp.getTime());
    
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;
    
    return {
      total: alerts.length,
      bySeverity,
      byRule,
      acknowledgedCount,
      averageResponseTime: Math.round(averageResponseTime),
    };
  }

  /**
   * Start periodic monitoring checks
   */
  private startPeriodicChecks(): void {
    // Check alerts every minute
    setInterval(() => {
      try {
        this.checkAlertRules();
      } catch (error) {
        this.logger.error('Error checking alert rules', error);
      }
    }, 60 * 1000);
    
    // Log system status every 5 minutes
    setInterval(async () => {
      try {
        const status = await this.getSystemStatus();
        this.loggingService.log(`System status check: ${status.overall}`, {
          operation: 'system_status',
          overall: status.overall,
          uptime: status.uptime,
          checksCount: status.checks.length,
        });
      } catch (error) {
        this.logger.error('Error in periodic system status check', error);
      }
    }, 5 * 60 * 1000);
    
    this.logger.log('Periodic monitoring checks started');
  }
}
