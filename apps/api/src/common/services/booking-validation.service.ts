import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneUtils } from '../utils/timezone.utils';
import { EnhancedConflictDetectionService } from './enhanced-conflict-detection.service';

export interface BookingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestedChanges?: {
    startTime?: Date;
    endTime?: Date;
    duration?: number;
  };
}

@Injectable()
export class BookingValidationService {
  constructor(
    private prisma: PrismaService,
    private conflictDetection: EnhancedConflictDetectionService
  ) {}

  /**
   * Comprehensive validation for booking requests
   */
  async validateBookingRequest(
    hostId: string,
    meetingTypeId: string,
    startTime: string | Date,
    endTime: string | Date,
    attendees: any[],
    excludeBookingId?: string
  ): Promise<BookingValidationResult> {
    const result: BookingValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // 1. Validate host and meeting type
      const { host, meetingType } = await this.validateHostAndMeetingType(hostId, meetingTypeId);
      
      // 2. Validate and normalize times
      const { startDateTime, endDateTime } = await this.validateAndNormalizeTimes(
        startTime, endTime, meetingType, host.timezone
      );

      // 3. Validate business rules
      await this.validateBusinessRules(meetingType, startDateTime, endDateTime, attendees, result);

      // 4. Check for conflicts
      const conflictResult = await this.conflictDetection.checkBookingConflicts(
        hostId, startDateTime, endDateTime, excludeBookingId
      );

      if (conflictResult.hasConflicts) {
        result.isValid = false;
        result.errors.push(...conflictResult.conflicts.map(c => 
          this.formatConflictMessage(c)
        ));
      }

      // 5. Check daily booking limits
      if (meetingType.maxBookingsPerDay) {
        const dailyBookingCheck = await this.checkDailyBookingLimit(
          hostId, startDateTime, meetingType.maxBookingsPerDay, excludeBookingId
        );
        
        if (!dailyBookingCheck.isValid) {
          result.isValid = false;
          result.errors.push(dailyBookingCheck.message);
        }
      }

      // 6. Validate advance notice requirement
      const noticeCheck = this.validateAdvanceNotice(startDateTime, meetingType.requiredNoticeMinutes);
      if (!noticeCheck.isValid) {
        result.isValid = false;
        result.errors.push(noticeCheck.message);
      }

      // 7. Check for overlapping bookings with buffer
      if (meetingType.bufferBefore > 0 || meetingType.bufferAfter > 0) {
        const bufferCheck = await this.checkBufferTimeConflicts(
          hostId, startDateTime, endDateTime, meetingType, excludeBookingId
        );
        
        if (!bufferCheck.isValid) {
          result.warnings.push(bufferCheck.message);
        }
      }

    } catch (error) {
      result.isValid = false;
      result.errors.push(error.message || 'Validation failed');
    }

    return result;
  }

  /**
   * Validate host exists and meeting type is accessible
   */
  private async validateHostAndMeetingType(hostId: string, meetingTypeId: string) {
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { 
        id: true, 
        isActive: true, 
        timezone: true,
        firstName: true,
        lastName: true
      }
    });

    if (!host) {
      throw new NotFoundException('Host user not found');
    }

    if (!host.isActive) {
      throw new BadRequestException('This user is currently not accepting bookings');
    }

    const meetingType = await this.prisma.meetingType.findFirst({
      where: {
        id: meetingTypeId,
        isActive: true,
        OR: [
          { hostId },
          { organization: { members: { some: { userId: hostId } } } }
        ]
      }
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found or not accessible');
    }

    return { host, meetingType };
  }

  /**
   * Validate and normalize time inputs
   */
  private async validateAndNormalizeTimes(
    startTime: string | Date,
    endTime: string | Date,
    meetingType: any,
    hostTimezone: string
  ) {
    let startDateTime: Date;
    let endDateTime: Date;

    // Parse times considering timezone
    if (typeof startTime === 'string') {
      if (startTime.includes('T') && !startTime.includes('+') && !startTime.includes('Z')) {
        // Local time format, parse in host timezone
        startDateTime = TimezoneUtils.parseTimeInTimezone(startTime, hostTimezone);
      } else {
        startDateTime = new Date(startTime);
      }
    } else {
      startDateTime = startTime;
    }

    if (typeof endTime === 'string') {
      if (endTime.includes('T') && !endTime.includes('+') && !endTime.includes('Z')) {
        // Local time format, parse in host timezone
        endDateTime = TimezoneUtils.parseTimeInTimezone(endTime, hostTimezone);
      } else {
        endDateTime = new Date(endTime);
      }
    } else {
      endDateTime = endTime;
    }

    // Validate times are valid dates
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      throw new BadRequestException('Invalid date/time format');
    }

    // Validate start time is before end time
    if (startDateTime >= endDateTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    // Check if duration matches meeting type
    const actualDuration = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60);
    if (Math.abs(actualDuration - meetingType.duration) > 1) { // Allow 1 minute tolerance
      // Auto-correct end time based on meeting type duration
      endDateTime = new Date(startDateTime.getTime() + meetingType.duration * 60 * 1000);
    }

    return { startDateTime, endDateTime };
  }

  /**
   * Validate business rules
   */
  private async validateBusinessRules(
    meetingType: any,
    startDateTime: Date,
    endDateTime: Date,
    attendees: any[],
    result: BookingValidationResult
  ) {
    // Check if booking is for a past date
    const now = new Date();
    if (startDateTime < now) {
      result.errors.push('Cannot book appointments for past dates');
    }

    // Validate attendee count
    if (meetingType.maxAttendees && attendees.length > meetingType.maxAttendees) {
      result.errors.push(
        `Maximum ${meetingType.maxAttendees} attendees allowed, but ${attendees.length} provided`
      );
    }

    // Validate attendee information
    for (const attendee of attendees) {
      if (!attendee.email || !this.isValidEmail(attendee.email)) {
        result.errors.push(`Invalid email address: ${attendee.email}`);
      }
      
      if (!attendee.name || attendee.name.trim().length < 2) {
        result.errors.push('Attendee name must be at least 2 characters long');
      }
    }

    // Check for reasonable booking times (e.g., not in the middle of the night)
    const hour = startDateTime.getHours();
    if (hour < 6 || hour > 22) {
      result.warnings.push('Booking is scheduled outside typical business hours');
    }

    // Validate duration is reasonable
    const durationHours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60);
    if (durationHours > 8) {
      result.warnings.push('Meeting duration is unusually long (over 8 hours)');
    }
  }

  /**
   * Check daily booking limit
   */
  private async checkDailyBookingLimit(
    hostId: string,
    startDateTime: Date,
    maxBookingsPerDay: number,
    excludeBookingId?: string
  ): Promise<{ isValid: boolean; message?: string }> {
    const startOfDay = new Date(startDateTime);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(startDateTime);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await this.prisma.booking.count({
      where: {
        hostId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: {
          in: ['CONFIRMED', 'PENDING']
        },
        id: excludeBookingId ? { not: excludeBookingId } : undefined
      }
    });

    if (existingBookings >= maxBookingsPerDay) {
      return {
        isValid: false,
        message: `Daily booking limit of ${maxBookingsPerDay} has been reached for this date`
      };
    }

    return { isValid: true };
  }

  /**
   * Validate advance notice requirement
   */
  private validateAdvanceNotice(
    startDateTime: Date,
    requiredNoticeMinutes: number
  ): { isValid: boolean; message?: string } {
    const now = new Date();
    const minutesUntilBooking = (startDateTime.getTime() - now.getTime()) / (1000 * 60);

    if (minutesUntilBooking < requiredNoticeMinutes) {
      const hoursRequired = Math.ceil(requiredNoticeMinutes / 60);
      return {
        isValid: false,
        message: `This meeting type requires at least ${hoursRequired} hours advance notice`
      };
    }

    return { isValid: true };
  }

  /**
   * Check buffer time conflicts
   */
  private async checkBufferTimeConflicts(
    hostId: string,
    startDateTime: Date,
    endDateTime: Date,
    meetingType: any,
    excludeBookingId?: string
  ): Promise<{ isValid: boolean; message?: string }> {
    const bufferStart = new Date(startDateTime.getTime() - meetingType.bufferBefore * 60 * 1000);
    const bufferEnd = new Date(endDateTime.getTime() + meetingType.bufferAfter * 60 * 1000);

    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: {
          in: ['CONFIRMED', 'PENDING']
        },
        OR: [
          {
            startTime: { lt: bufferEnd },
            endTime: { gt: bufferStart }
          }
        ]
      },
      select: {
        id: true,
        startTime: true,
        endTime: true
      }
    });

    if (conflictingBookings.length > 0) {
      return {
        isValid: false,
        message: `Buffer time conflicts with existing booking. This meeting type requires ${meetingType.bufferBefore} minutes before and ${meetingType.bufferAfter} minutes after.`
      };
    }

    return { isValid: true };
  }

  /**
   * Format conflict message for user display
   */
  private formatConflictMessage(conflict: any): string {
    switch (conflict.type) {
      case 'booking':
        return `Time conflicts with existing booking: ${conflict.details.title} (${conflict.details.status})`;
      case 'availability':
        if (conflict.details.reason === 'NO_AVAILABILITY_CONFIGURED') {
          return 'No availability configured for this time slot';
        } else {
          return 'Requested time is outside of available hours';
        }
      case 'blocked_time':
        return `Time slot is blocked: ${conflict.details.reason}`;
      default:
        return 'Time slot is not available';
    }
  }

  /**
   * Simple email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
