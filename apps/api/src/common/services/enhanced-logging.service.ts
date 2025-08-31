import { Injectable, Logger, LoggerService } from '@nestjs/common';

export interface LogContext {
  userId?: string;
  hostId?: string;
  meetingTypeId?: string;
  bookingId?: string;
  operation?: string;
  requestId?: string;
  duration?: number;
  [key: string]: any;
}

export interface StructuredLogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context: LogContext;
  service: string;
  operation?: string;
  error?: Error;
}

@Injectable()
export class EnhancedLoggingService implements LoggerService {
  private readonly logger = new Logger(EnhancedLoggingService.name);
  private readonly logEntries: StructuredLogEntry[] = [];
  private readonly maxLogEntries = 50000;

  /**
   * Log an informational message
   */
  log(message: string, context?: LogContext): void {
    this.addLogEntry('info', message, context || {});
    this.logger.log(this.formatMessage(message, context));
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.addLogEntry('error', message, context || {}, error);
    this.logger.error(this.formatMessage(message, context), error?.stack);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    this.addLogEntry('warn', message, context || {});
    this.logger.warn(this.formatMessage(message, context));
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LogContext): void {
    this.addLogEntry('debug', message, context || {});
    this.logger.debug(this.formatMessage(message, context));
  }

  /**
   * Log verbose messages (alias for debug)
   */
  verbose(message: string, context?: LogContext): void {
    this.debug(message, context);
  }

  /**
   * Log booking operation start
   */
  logBookingStart(operation: string, context: LogContext): void {
    this.log(`Booking operation started: ${operation}`, {
      ...context,
      operation,
      stage: 'start',
    });
  }

  /**
   * Log booking operation success
   */
  logBookingSuccess(operation: string, context: LogContext, duration?: number): void {
    this.log(`Booking operation completed: ${operation}`, {
      ...context,
      operation,
      stage: 'success',
      duration,
    });
  }

  /**
   * Log booking operation failure
   */
  logBookingFailure(operation: string, error: Error, context: LogContext, duration?: number): void {
    this.error(`Booking operation failed: ${operation}`, error, {
      ...context,
      operation,
      stage: 'failure',
      duration,
      errorType: error.constructor.name,
      errorMessage: error.message,
    });
  }

  /**
   * Log validation events
   */
  logValidation(type: 'success' | 'failure', validationType: string, context: LogContext, details?: any): void {
    const level = type === 'failure' ? 'warn' : 'debug';
    const message = `Validation ${type}: ${validationType}`;
    
    this[level](message, {
      ...context,
      operation: 'validation',
      validationType,
      validationResult: type,
      details,
    });
  }

  /**
   * Log conflict detection
   */
  logConflictDetection(hasConflict: boolean, context: LogContext, conflictDetails?: any): void {
    const level = hasConflict ? 'warn' : 'debug';
    const message = hasConflict ? 'Scheduling conflict detected' : 'No scheduling conflicts found';
    
    this[level](message, {
      ...context,
      operation: 'conflict_detection',
      hasConflict,
      conflictDetails,
    });
  }

  /**
   * Log notification events
   */
  logNotification(
    type: 'sent' | 'failed' | 'queued',
    notificationType: string,
    context: LogContext,
    details?: any
  ): void {
    const level = type === 'failed' ? 'error' : 'info';
    const message = `Notification ${type}: ${notificationType}`;
    
    this[level](message, {
      ...context,
      operation: 'notification',
      notificationType,
      notificationStatus: type,
      details,
    });
  }

  /**
   * Log timezone operations
   */
  logTimezone(operation: string, context: LogContext, timezoneData?: any): void {
    this.debug(`Timezone operation: ${operation}`, {
      ...context,
      operation: 'timezone',
      timezoneOperation: operation,
      timezoneData,
    });
  }

  /**
   * Log calendar integration events
   */
  logCalendarIntegration(
    provider: string,
    operation: string,
    success: boolean,
    context: LogContext,
    details?: any
  ): void {
    const level = success ? 'info' : 'error';
    const message = `Calendar ${operation} ${success ? 'succeeded' : 'failed'}: ${provider}`;
    
    this[level](message, {
      ...context,
      operation: 'calendar_integration',
      calendarProvider: provider,
      calendarOperation: operation,
      success,
      details,
    });
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation: string, duration: number, context: LogContext, metadata?: any): void {
    const level = duration > 5000 ? 'warn' : duration > 2000 ? 'info' : 'debug';
    const message = `Performance: ${operation} completed in ${duration}ms`;
    
    this[level](message, {
      ...context,
      operation: 'performance',
      performanceOperation: operation,
      duration,
      slow: duration > 2000,
      metadata,
    });
  }

  /**
   * Log database operations
   */
  logDatabase(operation: string, table: string, context: LogContext, queryInfo?: any): void {
    this.debug(`Database ${operation}: ${table}`, {
      ...context,
      operation: 'database',
      databaseOperation: operation,
      table,
      queryInfo,
    });
  }

  /**
   * Log API requests
   */
  logApiRequest(method: string, endpoint: string, context: LogContext, requestData?: any): void {
    this.log(`API ${method} ${endpoint}`, {
      ...context,
      operation: 'api_request',
      httpMethod: method,
      endpoint,
      requestData,
    });
  }

  /**
   * Log authentication events
   */
  logAuth(event: string, context: LogContext, authData?: any): void {
    this.log(`Auth event: ${event}`, {
      ...context,
      operation: 'authentication',
      authEvent: event,
      authData,
    });
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 100, level?: 'debug' | 'info' | 'warn' | 'error'): StructuredLogEntry[] {
    let logs = this.logEntries.slice(-count);
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get logs by operation
   */
  getLogsByOperation(operation: string, count = 100): StructuredLogEntry[] {
    return this.logEntries
      .filter(log => log.operation === operation)
      .slice(-count)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get logs by user
   */
  getLogsByUser(userId: string, count = 100): StructuredLogEntry[] {
    return this.logEntries
      .filter(log => log.context.userId === userId)
      .slice(-count)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get logs by booking
   */
  getLogsByBooking(bookingId: string): StructuredLogEntry[] {
    return this.logEntries
      .filter(log => log.context.bookingId === bookingId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get error logs
   */
  getErrorLogs(count = 50): StructuredLogEntry[] {
    return this.logEntries
      .filter(log => log.level === 'error')
      .slice(-count)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Search logs
   */
  searchLogs(query: string, count = 100): StructuredLogEntry[] {
    const lowercaseQuery = query.toLowerCase();
    
    return this.logEntries
      .filter(log => 
        log.message.toLowerCase().includes(lowercaseQuery) ||
        JSON.stringify(log.context).toLowerCase().includes(lowercaseQuery)
      )
      .slice(-count)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get log statistics
   */
  getLogStatistics(timeRange?: { start: Date; end: Date }): {
    total: number;
    byLevel: Record<string, number>;
    byOperation: Record<string, number>;
    errorRate: number;
    topErrors: Array<{ message: string; count: number }>;
  } {
    let logs = this.logEntries;
    
    if (timeRange) {
      logs = logs.filter(log => 
        log.timestamp >= timeRange.start && log.timestamp <= timeRange.end
      );
    }

    const byLevel = logs.reduce((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byOperation = logs.reduce((acc, log) => {
      const operation = log.operation || 'unknown';
      acc[operation] = (acc[operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errorLogs = logs.filter(log => log.level === 'error');
    const errorRate = logs.length > 0 ? errorLogs.length / logs.length : 0;

    const errorMessages = errorLogs.reduce((acc, log) => {
      acc[log.message] = (acc[log.message] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topErrors = Object.entries(errorMessages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    return {
      total: logs.length,
      byLevel,
      byOperation,
      errorRate: Math.round(errorRate * 100) / 100,
      topErrors,
    };
  }

  /**
   * Clear old logs
   */
  clearOldLogs(olderThan: Date): number {
    const initialCount = this.logEntries.length;
    const validEntries = this.logEntries.filter(entry => entry.timestamp > olderThan);
    this.logEntries.length = 0;
    this.logEntries.push(...validEntries);
    
    const removedCount = initialCount - this.logEntries.length;
    if (removedCount > 0) {
      this.log(`Cleared ${removedCount} old log entries`);
    }
    
    return removedCount;
  }

  /**
   * Helper methods
   */
  private addLogEntry(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context: LogContext,
    error?: Error
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      service: context.operation || 'booking-service',
      operation: context.operation,
      error,
    };

    this.logEntries.push(entry);

    // Keep only recent entries
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.splice(0, this.logEntries.length - this.maxLogEntries);
    }
  }

  private formatMessage(message: string, context?: LogContext): string {
    if (!context || Object.keys(context).length === 0) {
      return message;
    }

    const contextStr = Object.entries(context)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');

    return `${message} | ${contextStr}`;
  }

  /**
   * Create a scoped logger for a specific operation
   */
  createScopedLogger(baseContext: LogContext) {
    return {
      log: (message: string, additionalContext?: LogContext) =>
        this.log(message, { ...baseContext, ...additionalContext }),
      
      error: (message: string, error?: Error, additionalContext?: LogContext) =>
        this.error(message, error, { ...baseContext, ...additionalContext }),
      
      warn: (message: string, additionalContext?: LogContext) =>
        this.warn(message, { ...baseContext, ...additionalContext }),
      
      debug: (message: string, additionalContext?: LogContext) =>
        this.debug(message, { ...baseContext, ...additionalContext }),
      
      logStart: (operation: string) =>
        this.logBookingStart(operation, baseContext),
      
      logSuccess: (operation: string, duration?: number) =>
        this.logBookingSuccess(operation, baseContext, duration),
      
      logFailure: (operation: string, error: Error, duration?: number) =>
        this.logBookingFailure(operation, error, baseContext, duration),
    };
  }
}
