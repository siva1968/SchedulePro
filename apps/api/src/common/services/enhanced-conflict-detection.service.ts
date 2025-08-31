import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneUtils } from '../utils/timezone.utils';

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: Array<{
    type: 'booking' | 'availability' | 'blocked_time';
    startTime: Date;
    endTime: Date;
    details: any;
  }>;
  suggestions?: Array<{
    startTime: Date;
    endTime: Date;
    label: string;
  }>;
}

@Injectable()
export class EnhancedConflictDetectionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Comprehensive conflict detection for booking requests
   */
  async checkBookingConflicts(
    hostId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
    includeBuffer = true
  ): Promise<ConflictCheckResult> {
    const conflicts: ConflictCheckResult['conflicts'] = [];

    // Get host timezone for proper calculations
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { timezone: true }
    });

    const hostTimezone = host?.timezone || 'UTC';

    // 1. Check existing bookings
    const bookingConflicts = await this.checkBookingTimeConflicts(
      hostId, startTime, endTime, excludeBookingId
    );
    conflicts.push(...bookingConflicts);

    // 2. Check availability windows
    const availabilityConflicts = await this.checkAvailabilityConflicts(
      hostId, startTime, endTime, hostTimezone
    );
    conflicts.push(...availabilityConflicts);

    // 3. Check blocked times
    const blockedTimeConflicts = await this.checkBlockedTimeConflicts(
      hostId, startTime, endTime, hostTimezone
    );
    conflicts.push(...blockedTimeConflicts);

    // 4. Generate suggestions if conflicts exist
    let suggestions: ConflictCheckResult['suggestions'] = [];
    if (conflicts.length > 0) {
      suggestions = await this.generateAlternativeSlots(
        hostId, startTime, endTime, hostTimezone
      );
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      suggestions
    };
  }

  /**
   * Check for conflicts with existing bookings
   */
  private async checkBookingTimeConflicts(
    hostId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string
  ): Promise<ConflictCheckResult['conflicts']> {
    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: {
          in: ['CONFIRMED', 'PENDING']
        },
        OR: [
          {
            startTime: { lt: endTime },
            endTime: { gt: startTime }
          }
        ]
      },
      include: {
        attendees: {
          select: { email: true, name: true }
        },
        meetingType: {
          select: { name: true }
        }
      }
    });

    return conflictingBookings.map(booking => ({
      type: 'booking' as const,
      startTime: booking.startTime,
      endTime: booking.endTime,
      details: {
        id: booking.id,
        title: booking.meetingType.name,
        attendees: booking.attendees,
        status: booking.status
      }
    }));
  }

  /**
   * Check if requested time falls within available hours
   */
  private async checkAvailabilityConflicts(
    hostId: string,
    startTime: Date,
    endTime: Date,
    hostTimezone: string
  ): Promise<ConflictCheckResult['conflicts']> {
    const conflicts: ConflictCheckResult['conflicts'] = [];
    
    // Get day of week for the requested time
    const dayOfWeek = startTime.getDay();
    const requestedDate = TimezoneUtils.formatTimeInTimezone(startTime, hostTimezone).split(' ')[0];

    // Check for applicable availability windows
    const availabilities = await this.prisma.availability.findMany({
      where: {
        userId: hostId,
        isBlocked: false,
        OR: [
          {
            type: 'RECURRING',
            dayOfWeek
          },
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(requestedDate + 'T00:00:00.000Z'),
              lt: new Date(requestedDate + 'T23:59:59.999Z')
            }
          }
        ]
      }
    });

    if (availabilities.length === 0) {
      conflicts.push({
        type: 'availability',
        startTime,
        endTime,
        details: {
          reason: 'NO_AVAILABILITY_CONFIGURED',
          message: 'No availability configured for this time slot'
        }
      });
      return conflicts;
    }

    // Convert requested times to host timezone for comparison
    const startTimeLocal = TimezoneUtils.formatTimeInTimezone(startTime, hostTimezone, true);
    const endTimeLocal = TimezoneUtils.formatTimeInTimezone(endTime, hostTimezone, true);
    
    const requestedTimeStart = startTimeLocal.split(' ')[1]; // HH:mm:ss
    const requestedTimeEnd = endTimeLocal.split(' ')[1]; // HH:mm:ss

    // Check if any availability window covers the requested time
    const hasValidAvailability = availabilities.some(avail => {
      return requestedTimeStart >= avail.startTime && requestedTimeEnd <= avail.endTime;
    });

    if (!hasValidAvailability) {
      conflicts.push({
        type: 'availability',
        startTime,
        endTime,
        details: {
          reason: 'OUTSIDE_AVAILABILITY_HOURS',
          message: 'Requested time is outside of available hours',
          availableWindows: availabilities.map(a => ({
            startTime: a.startTime,
            endTime: a.endTime,
            type: a.type
          }))
        }
      });
    }

    return conflicts;
  }

  /**
   * Check for blocked time conflicts
   */
  private async checkBlockedTimeConflicts(
    hostId: string,
    startTime: Date,
    endTime: Date,
    hostTimezone: string
  ): Promise<ConflictCheckResult['conflicts']> {
    const dayOfWeek = startTime.getDay();
    const requestedDate = TimezoneUtils.formatTimeInTimezone(startTime, hostTimezone).split(' ')[0];

    const blockedTimes = await this.prisma.availability.findMany({
      where: {
        userId: hostId,
        isBlocked: true,
        OR: [
          {
            type: 'RECURRING',
            dayOfWeek
          },
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(requestedDate + 'T00:00:00.000Z'),
              lt: new Date(requestedDate + 'T23:59:59.999Z')
            }
          }
        ]
      }
    });

    return blockedTimes
      .filter(blocked => {
        const startTimeLocal = TimezoneUtils.formatTimeInTimezone(startTime, hostTimezone, true);
        const endTimeLocal = TimezoneUtils.formatTimeInTimezone(endTime, hostTimezone, true);
        
        const requestedTimeStart = startTimeLocal.split(' ')[1];
        const requestedTimeEnd = endTimeLocal.split(' ')[1];

        // Check if the requested time overlaps with blocked time
        return !(requestedTimeEnd <= blocked.startTime || requestedTimeStart >= blocked.endTime);
      })
      .map(blocked => ({
        type: 'blocked_time' as const,
        startTime,
        endTime,
        details: {
          blockedStart: blocked.startTime,
          blockedEnd: blocked.endTime,
          reason: blocked.blockReason || 'Time blocked',
          type: blocked.type
        }
      }));
  }

  /**
   * Generate alternative time slots when conflicts exist
   */
  private async generateAlternativeSlots(
    hostId: string,
    originalStart: Date,
    originalEnd: Date,
    hostTimezone: string
  ): Promise<ConflictCheckResult['suggestions']> {
    const suggestions: ConflictCheckResult['suggestions'] = [];
    const duration = originalEnd.getTime() - originalStart.getTime();
    
    // Try to find slots on the same day first
    const sameDaySlots = await this.findAvailableSlotsOnDate(
      hostId, originalStart, duration, hostTimezone, 3
    );
    suggestions.push(...sameDaySlots);

    // If no same-day slots, look at next few days
    if (suggestions.length < 3) {
      for (let i = 1; i <= 7 && suggestions.length < 5; i++) {
        const nextDay = new Date(originalStart);
        nextDay.setDate(nextDay.getDate() + i);
        
        const nextDaySlots = await this.findAvailableSlotsOnDate(
          hostId, nextDay, duration, hostTimezone, 2
        );
        suggestions.push(...nextDaySlots);
      }
    }

    return suggestions.slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Find available slots on a specific date
   */
  private async findAvailableSlotsOnDate(
    hostId: string,
    date: Date,
    duration: number,
    hostTimezone: string,
    maxSlots: number
  ): Promise<ConflictCheckResult['suggestions']> {
    const suggestions: ConflictCheckResult['suggestions'] = [];
    const dayOfWeek = date.getDay();
    const dateStr = TimezoneUtils.formatTimeInTimezone(date, hostTimezone).split(' ')[0];

    // Get availability for the day
    const availabilities = await this.prisma.availability.findMany({
      where: {
        userId: hostId,
        isBlocked: false,
        OR: [
          {
            type: 'RECURRING',
            dayOfWeek
          },
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(dateStr + 'T00:00:00.000Z'),
              lt: new Date(dateStr + 'T23:59:59.999Z')
            }
          }
        ]
      },
      orderBy: { startTime: 'asc' }
    });

    if (availabilities.length === 0) return suggestions;

    // Get existing bookings for the day
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        startTime: {
          gte: new Date(dateStr + 'T00:00:00.000Z'),
          lt: new Date(dateStr + 'T23:59:59.999Z')
        },
        status: {
          in: ['CONFIRMED', 'PENDING']
        }
      }
    });

    // Generate time slots for each availability window
    for (const availability of availabilities) {
      if (suggestions.length >= maxSlots) break;

      const windowStart = TimezoneUtils.parseTimeInTimezone(
        `${dateStr}T${availability.startTime}`, hostTimezone
      );
      const windowEnd = TimezoneUtils.parseTimeInTimezone(
        `${dateStr}T${availability.endTime}`, hostTimezone
      );

      const slots = TimezoneUtils.generateTimeSlots(windowStart, windowEnd, duration / (1000 * 60));

      for (const slot of slots) {
        if (suggestions.length >= maxSlots) break;

        // Check if slot conflicts with existing bookings
        const hasConflict = existingBookings.some(booking =>
          TimezoneUtils.doTimesOverlap(slot.startTime, slot.endTime, booking.startTime, booking.endTime)
        );

        if (!hasConflict) {
          suggestions.push({
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: TimezoneUtils.formatTimeInTimezone(slot.startTime, hostTimezone)
          });
        }
      }
    }

    return suggestions;
  }
}
