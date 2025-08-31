import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BookingValidationService } from './booking-validation.service';
import { EnhancedConflictDetectionService } from './enhanced-conflict-detection.service';

describe('BookingValidationService', () => {
  let service: BookingValidationService;
  let prismaService: PrismaService;
  let conflictDetectionService: EnhancedConflictDetectionService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    meetingType: {
      findUnique: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockConflictDetectionService = {
    checkBookingConflicts: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingValidationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EnhancedConflictDetectionService,
          useValue: mockConflictDetectionService,
        },
      ],
    }).compile();

    service = module.get<BookingValidationService>(BookingValidationService);
    prismaService = module.get<PrismaService>(PrismaService);
    conflictDetectionService = module.get<EnhancedConflictDetectionService>(EnhancedConflictDetectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBookingRequest', () => {
    const mockHost = {
      id: 'host-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      timezone: 'America/New_York',
      isActive: true,
    };

    const mockMeetingType = {
      id: 'meeting-1',
      name: 'Consultation',
      duration: 30,
      hostId: 'host-1',
      maxBookingsPerDay: 5,
      requiredNoticeMinutes: 60,
      bufferBefore: 5,
      bufferAfter: 5,
      isActive: true,
    };

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockHost);
      mockPrismaService.meetingType.findUnique.mockResolvedValue(mockMeetingType);
      mockConflictDetectionService.checkBookingConflicts.mockResolvedValue({
        hasConflicts: false,
        conflicts: [],
        suggestions: [],
      });
      mockPrismaService.booking.count.mockResolvedValue(0);
    });

    it('should validate a correct booking request', async () => {
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000); // 30 minutes later

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        [{ email: 'attendee@example.com', name: 'Attendee' }]
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject booking with non-existent host', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'invalid-host',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Host not found');
    });

    it('should reject booking with inactive host', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockHost,
        isActive: false,
      });

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Host is not currently accepting bookings');
    });

    it('should reject booking with non-existent meeting type', async () => {
      mockPrismaService.meetingType.findUnique.mockResolvedValue(null);

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'host-1',
        'invalid-meeting',
        futureTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Meeting type not found or not accessible');
    });

    it('should reject booking in the past', async () => {
      const pastTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const endTime = new Date(pastTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        pastTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cannot book meetings in the past');
    });

    it('should reject booking with insufficient advance notice', async () => {
      // Meeting requires 60 minutes notice, but we're booking only 30 minutes ahead
      const futureTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Booking requires at least 60 minutes advance notice');
    });

    it('should reject booking that exceeds daily limit', async () => {
      mockPrismaService.booking.count.mockResolvedValue(5); // Already at daily limit

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Daily booking limit (5) reached for this date');
    });

    it('should reject booking with time conflicts', async () => {
      mockConflictDetectionService.checkBookingConflicts.mockResolvedValue({
        hasConflicts: true,
        conflicts: [
          {
            type: 'existing_booking',
            message: 'Conflicts with existing booking',
            conflictingItem: { startTime: new Date(), endTime: new Date() },
          },
        ],
        suggestions: [],
      });

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Conflicts with existing booking');
    });

    it('should validate attendees correctly', async () => {
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      // Valid attendees
      const validResult = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        [
          { email: 'attendee1@example.com', name: 'Attendee 1' },
          { email: 'attendee2@example.com', name: 'Attendee 2' },
        ]
      );

      expect(validResult.isValid).toBe(true);

      // Invalid email
      const invalidResult = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        [{ email: 'invalid-email', name: 'Invalid' }]
      );

      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('Invalid email address: invalid-email');
    });

    it('should handle timezone validation correctly', async () => {
      const futureTime = '2025-09-01T14:00:00';
      const endTime = '2025-09-01T14:30:00';

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      // Should parse times in host's timezone (America/New_York)
      expect(result.isValid).toBe(true);
    });

    it('should suggest correct end time for incorrect duration', async () => {
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const incorrectEndTime = new Date(futureTime.getTime() + 45 * 60 * 1000); // 45 minutes instead of 30

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        incorrectEndTime,
        []
      );

      expect(result.warnings).toContain(
        'End time adjusted to match meeting type duration (30 minutes)'
      );
      expect(result.suggestedChanges?.endTime).toBeDefined();
    });

    it('should handle buffer time conflicts as warnings', async () => {
      // Mock a booking that conflicts with buffer time but not the actual meeting time
      mockPrismaService.booking.findMany.mockResolvedValue([
        {
          startTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // Same start time as our booking
          endTime: new Date(Date.now() + 2.5 * 60 * 60 * 1000),
        },
      ]);

      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000); // 30 min after existing
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      // Should have warnings about buffer time
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle daylight saving time transitions', async () => {
      const mockHost = {
        id: 'host-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        timezone: 'America/New_York',
        isActive: true,
      };

      const mockMeetingType = {
        id: 'meeting-1',
        name: 'Consultation',
        duration: 30,
        hostId: 'host-1',
        isActive: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockHost);
      mockPrismaService.meetingType.findUnique.mockResolvedValue(mockMeetingType);
      mockConflictDetectionService.checkBookingConflicts.mockResolvedValue({
        hasConflicts: false,
        conflicts: [],
        suggestions: [],
      });

      // Test during DST transition
      const dstTime = '2025-03-09T07:00:00'; // Spring forward day
      const endTime = '2025-03-09T07:30:00';

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        dstTime,
        endTime,
        []
      );

      expect(result).toBeDefined();
    });

    it('should handle very long meeting durations', async () => {
      const mockMeetingType = {
        id: 'meeting-1',
        name: 'All Day Workshop',
        duration: 480, // 8 hours
        hostId: 'host-1',
        isActive: true,
      };

      mockPrismaService.meetingType.findUnique.mockResolvedValue(mockMeetingType);

      const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      const endTime = new Date(futureTime.getTime() + 8 * 60 * 60 * 1000); // 8 hours later

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        []
      );

      expect(result.isValid).toBe(true);
    });

    it('should handle multiple attendees with duplicate emails', async () => {
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const endTime = new Date(futureTime.getTime() + 30 * 60 * 1000);

      const attendees = [
        { email: 'duplicate@example.com', name: 'First' },
        { email: 'duplicate@example.com', name: 'Second' },
        { email: 'unique@example.com', name: 'Unique' },
      ];

      const result = await service.validateBookingRequest(
        'host-1',
        'meeting-1',
        futureTime,
        endTime,
        attendees
      );

      expect(result.warnings).toContain('Duplicate attendee emails detected');
    });
  });
});
