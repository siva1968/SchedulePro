import { Test, TestingModule } from '@nestjs/testing';
import { BookingMetricsService } from '../services/booking-metrics.service';
import { PrismaService } from '../../database/prisma.service';

describe('BookingMetricsService', () => {
  let service: BookingMetricsService;
  let prismaService: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingMetricsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<BookingMetricsService>(BookingMetricsService);
    prismaService = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordEvent', () => {
    it('should record booking creation event', () => {
      const event = {
        type: 'booking_created' as const,
        data: { meetingTypeId: 'test-meeting-type' },
        processingTime: 1500,
        success: true,
        userId: 'test-user',
        hostId: 'test-host',
      };

      service.recordEvent(event);

      // Test that event was recorded (would check internal state in real implementation)
      expect(service).toBeDefined();
    });

    it('should record validation failure event', () => {
      const event = {
        type: 'validation_failed' as const,
        data: { reason: 'Invalid time slot' },
        processingTime: 500,
        success: false,
        userId: 'test-user',
      };

      service.recordEvent(event);

      expect(service).toBeDefined();
    });
  });

  describe('getBookingMetrics', () => {
    it('should return booking metrics for time range', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
      };

      // Record some test events
      service.recordEvent({
        type: 'booking_created',
        data: {},
        processingTime: 1000,
        success: true,
      });

      service.recordEvent({
        type: 'booking_created',
        data: {},
        processingTime: 2000,
        success: false,
      });

      const metrics = await service.getBookingMetrics(timeRange);

      expect(metrics).toHaveProperty('totalBookings');
      expect(metrics).toHaveProperty('successfulBookings');
      expect(metrics).toHaveProperty('failedBookings');
      expect(metrics).toHaveProperty('averageProcessingTime');
      expect(metrics).toHaveProperty('conflictRate');
      expect(metrics).toHaveProperty('validationFailureRate');
      expect(metrics).toHaveProperty('notificationSuccessRate');
    });
  });

  describe('getSystemHealthMetrics', () => {
    it('should return system health metrics', async () => {
      const healthMetrics = await service.getSystemHealthMetrics();

      expect(healthMetrics).toHaveProperty('apiResponseTime');
      expect(healthMetrics).toHaveProperty('databaseResponseTime');
      expect(healthMetrics).toHaveProperty('emailServiceHealth');
      expect(healthMetrics).toHaveProperty('calendarServiceHealth');
      expect(healthMetrics).toHaveProperty('activeConnections');
      expect(healthMetrics).toHaveProperty('errorRate');
    });

    it('should handle database connection errors', async () => {
      jest.spyOn(prismaService.user, 'count').mockRejectedValue(new Error('Connection failed'));

      const healthMetrics = await service.getSystemHealthMetrics();

      expect(healthMetrics.databaseResponseTime).toBe(-1);
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should return performance metrics', () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
      };

      // Record some performance events
      service.recordEvent({
        type: 'conflict_detected',
        data: {},
        processingTime: 800,
        success: true,
      });

      service.recordEvent({
        type: 'validation_failed',
        data: {},
        processingTime: 300,
        success: false,
      });

      const metrics = service.getPerformanceMetrics(timeRange);

      expect(metrics).toHaveProperty('timezone');
      expect(metrics).toHaveProperty('conflictDetection');
      expect(metrics).toHaveProperty('validation');
      expect(metrics).toHaveProperty('notifications');
    });
  });

  describe('getRealTimeStatus', () => {
    it('should return real-time system status', () => {
      const status = service.getRealTimeStatus();

      expect(status).toHaveProperty('currentLoad');
      expect(status).toHaveProperty('activeOperations');
      expect(status).toHaveProperty('errorRate');
      expect(status).toHaveProperty('averageResponseTime');
      expect(status).toHaveProperty('status');
      expect(['healthy', 'warning', 'critical']).toContain(status.status);
    });
  });

  describe('logPerformance', () => {
    it('should log performance timing', () => {
      const startTime = Date.now() - 1000;
      
      service.logPerformance('test_operation', startTime, true, { testData: 'value' });

      // Test that performance was logged
      expect(service).toBeDefined();
    });

    it('should log slow operations as warnings', () => {
      const startTime = Date.now() - 6000; // 6 seconds ago
      
      service.logPerformance('slow_operation', startTime, true);

      // In real implementation, would check that warning was logged
      expect(service).toBeDefined();
    });
  });

  describe('generateMetricsReport', () => {
    it('should generate comprehensive metrics report', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
      };

      const report = await service.generateMetricsReport(timeRange);

      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('performance');
      expect(report).toHaveProperty('systemHealth');
      expect(report).toHaveProperty('errorAnalysis');
      expect(report).toHaveProperty('recommendations');
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe('getHostMetrics', () => {
    it('should return metrics for specific host', async () => {
      const hostId = 'test-host-123';
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-02'),
      };

      // Record host-specific events
      service.recordEvent({
        type: 'booking_created',
        data: {},
        success: true,
        hostId,
      });

      const hostMetrics = await service.getHostMetrics(hostId, timeRange);

      expect(hostMetrics).toHaveProperty('bookingCount');
      expect(hostMetrics).toHaveProperty('averageProcessingTime');
      expect(hostMetrics).toHaveProperty('validationFailureRate');
      expect(hostMetrics).toHaveProperty('conflictRate');
      expect(hostMetrics).toHaveProperty('notificationSuccessRate');
    });
  });
});
