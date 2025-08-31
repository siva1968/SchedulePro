import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { BookingMetricsService } from '../services/booking-metrics.service';
import { EnhancedLoggingService } from '../services/enhanced-logging.service';
import { SystemMonitoringService } from '../services/system-monitoring.service';

@Controller('admin/monitoring')
export class MonitoringController {
  constructor(
    private readonly metricsService: BookingMetricsService,
    private readonly loggingService: EnhancedLoggingService,
    private readonly monitoringService: SystemMonitoringService,
  ) {}

  /**
   * Get system status
   */
  @Get('status')
  async getSystemStatus() {
    return this.monitoringService.getSystemStatus();
  }

  /**
   * Get real-time system metrics
   */
  @Get('realtime')
  getRealTimeStatus() {
    return this.metricsService.getRealTimeStatus();
  }

  /**
   * Get booking metrics
   */
  @Get('metrics/bookings')
  async getBookingMetrics(@Query() query: { start?: string; end?: string }) {
    const timeRange = {
      start: query.start ? new Date(query.start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: query.end ? new Date(query.end) : new Date(),
    };
    
    return this.metricsService.getBookingMetrics(timeRange);
  }

  /**
   * Get performance metrics
   */
  @Get('metrics/performance')
  getPerformanceMetrics(@Query() query: { start?: string; end?: string }) {
    const timeRange = {
      start: query.start ? new Date(query.start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: query.end ? new Date(query.end) : new Date(),
    };
    
    return this.metricsService.getPerformanceMetrics(timeRange);
  }

  /**
   * Get system health metrics
   */
  @Get('metrics/health')
  async getSystemHealthMetrics() {
    return this.metricsService.getSystemHealthMetrics();
  }

  /**
   * Get host performance metrics
   */
  @Get('metrics/host/:hostId')
  async getHostMetrics(
    @Param('hostId') hostId: string,
    @Query() query: { start?: string; end?: string }
  ) {
    const timeRange = {
      start: query.start ? new Date(query.start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: query.end ? new Date(query.end) : new Date(),
    };
    
    return this.metricsService.getHostMetrics(hostId, timeRange);
  }

  /**
   * Get error analysis
   */
  @Get('errors')
  getErrorAnalysis(@Query() query: { start?: string; end?: string }) {
    const timeRange = {
      start: query.start ? new Date(query.start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: query.end ? new Date(query.end) : new Date(),
    };
    
    return this.metricsService.getErrorAnalysis(timeRange);
  }

  /**
   * Get comprehensive metrics report
   */
  @Get('report')
  async getMetricsReport(@Query() query: { start?: string; end?: string }) {
    const timeRange = {
      start: query.start ? new Date(query.start) : new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: query.end ? new Date(query.end) : new Date(),
    };
    
    return this.metricsService.generateMetricsReport(timeRange);
  }

  /**
   * Get recent logs
   */
  @Get('logs')
  getRecentLogs(@Query() query: { count?: string; level?: string }) {
    const count = query.count ? parseInt(query.count) : 100;
    const level = query.level as 'debug' | 'info' | 'warn' | 'error' | undefined;
    
    return this.loggingService.getRecentLogs(count, level);
  }

  /**
   * Get logs by operation
   */
  @Get('logs/operation/:operation')
  getLogsByOperation(
    @Param('operation') operation: string,
    @Query('count') count?: string
  ) {
    const logCount = count ? parseInt(count) : 100;
    return this.loggingService.getLogsByOperation(operation, logCount);
  }

  /**
   * Get logs by user
   */
  @Get('logs/user/:userId')
  getLogsByUser(
    @Param('userId') userId: string,
    @Query('count') count?: string
  ) {
    const logCount = count ? parseInt(count) : 100;
    return this.loggingService.getLogsByUser(userId, logCount);
  }

  /**
   * Get logs by booking
   */
  @Get('logs/booking/:bookingId')
  getLogsByBooking(@Param('bookingId') bookingId: string) {
    return this.loggingService.getLogsByBooking(bookingId);
  }

  /**
   * Search logs
   */
  @Get('logs/search')
  searchLogs(@Query() query: { q: string; count?: string }) {
    const count = query.count ? parseInt(query.count) : 100;
    return this.loggingService.searchLogs(query.q, count);
  }

  /**
   * Get log statistics
   */
  @Get('logs/stats')
  getLogStatistics(@Query() query: { start?: string; end?: string }) {
    let timeRange: { start: Date; end: Date } | undefined;
    
    if (query.start && query.end) {
      timeRange = {
        start: new Date(query.start),
        end: new Date(query.end),
      };
    }
    
    return this.loggingService.getLogStatistics(timeRange);
  }

  /**
   * Get active alerts
   */
  @Get('alerts')
  getActiveAlerts() {
    return this.monitoringService.getActiveAlerts();
  }

  /**
   * Get all alerts
   */
  @Get('alerts/all')
  getAllAlerts(@Query('limit') limit?: string) {
    const alertLimit = limit ? parseInt(limit) : 100;
    return this.monitoringService.getAllAlerts(alertLimit);
  }

  /**
   * Acknowledge alert
   */
  @Post('alerts/:alertId/acknowledge')
  acknowledgeAlert(
    @Param('alertId') alertId: string,
    @Body() body: { acknowledgedBy: string }
  ) {
    const success = this.monitoringService.acknowledgeAlert(alertId, body.acknowledgedBy);
    return { success, alertId, acknowledgedBy: body.acknowledgedBy };
  }

  /**
   * Get alert statistics
   */
  @Get('alerts/stats')
  getAlertStatistics(@Query() query: { start?: string; end?: string }) {
    let timeRange: { start: Date; end: Date } | undefined;
    
    if (query.start && query.end) {
      timeRange = {
        start: new Date(query.start),
        end: new Date(query.end),
      };
    }
    
    return this.monitoringService.getAlertStatistics(timeRange);
  }

  /**
   * Manual health check trigger
   */
  @Post('health-check')
  async triggerHealthCheck() {
    return this.monitoringService.runAllHealthChecks();
  }

  /**
   * Record custom metric event
   */
  @Post('metrics/event')
  recordMetricEvent(@Body() eventData: {
    type: 'booking_created' | 'validation_failed' | 'conflict_detected' | 'notification_sent' | 'error_occurred';
    data: any;
    processingTime?: number;
    success: boolean;
    userId?: string;
    hostId?: string;
    meetingTypeId?: string;
  }) {
    this.metricsService.recordEvent(eventData);
    return { success: true, timestamp: new Date() };
  }

  /**
   * Clear old metrics
   */
  @Post('cleanup/metrics')
  clearOldMetrics(@Body() body: { olderThan: string }) {
    const olderThan = new Date(body.olderThan);
    this.metricsService.clearOldMetrics(olderThan);
    return { success: true, clearedOlderThan: olderThan };
  }

  /**
   * Clear old logs
   */
  @Post('cleanup/logs')
  clearOldLogs(@Body() body: { olderThan: string }) {
    const olderThan = new Date(body.olderThan);
    const removedCount = this.loggingService.clearOldLogs(olderThan);
    return { success: true, removedCount, clearedOlderThan: olderThan };
  }
}
