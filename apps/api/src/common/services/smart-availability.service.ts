import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneUtils } from '../utils/timezone.utils';

export interface AvailabilityPreference {
  preferredDays?: number[]; // 0-6 (Sunday-Saturday)
  preferredTimeRange?: {
    start: string; // HH:mm
    end: string; // HH:mm
  };
  timezone?: string;
  maxDaysAhead?: number;
}

export interface TimeSlotSuggestion {
  startTime: Date;
  endTime: Date;
  confidence: number; // 0-1, how good this suggestion is
  reason: string;
  hostTimezone: string;
  userDisplayTime?: string;
}

@Injectable()
export class SmartAvailabilityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get intelligent time slot suggestions based on host availability and user preferences
   */
  async getSmartSuggestions(
    hostId: string,
    durationMinutes: number,
    preferences: AvailabilityPreference = {},
    userTimezone = 'UTC',
    maxSuggestions = 10
  ): Promise<TimeSlotSuggestion[]> {
    // Get host information
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { timezone: true, firstName: true, lastName: true }
    });

    if (!host) {
      throw new Error('Host not found');
    }

    const hostTimezone = host.timezone || 'UTC';
    const maxDaysAhead = preferences.maxDaysAhead || 30;
    
    // Get host's availability patterns
    const availabilityPatterns = await this.getAvailabilityPatterns(hostId);
    
    // Get existing bookings for conflict checking
    const existingBookings = await this.getExistingBookings(hostId, maxDaysAhead);
    
    // Generate suggestions
    const suggestions: TimeSlotSuggestion[] = [];
    const currentDate = new Date();
    
    for (let dayOffset = 0; dayOffset < maxDaysAhead && suggestions.length < maxSuggestions; dayOffset++) {
      const targetDate = new Date(currentDate);
      targetDate.setDate(currentDate.getDate() + dayOffset);
      
      // Skip if this day is not in preferred days
      if (preferences.preferredDays && !preferences.preferredDays.includes(targetDate.getDay())) {
        continue;
      }
      
      const daySuggestions = await this.generateSuggestionsForDay(
        targetDate,
        hostId,
        hostTimezone,
        userTimezone,
        durationMinutes,
        availabilityPatterns,
        existingBookings,
        preferences
      );
      
      suggestions.push(...daySuggestions);
    }
    
    // Sort by confidence and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);
  }

  /**
   * Get availability patterns for a host
   */
  private async getAvailabilityPatterns(hostId: string) {
    return await this.prisma.availability.findMany({
      where: {
        userId: hostId,
        isBlocked: false
      },
      orderBy: [
        { type: 'asc' },
        { dayOfWeek: 'asc' },
        { startTime: 'asc' }
      ]
    });
  }

  /**
   * Get existing bookings for the next N days
   */
  private async getExistingBookings(hostId: string, daysAhead: number) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);
    
    return await this.prisma.booking.findMany({
      where: {
        hostId,
        startTime: {
          gte: new Date(),
          lte: endDate
        },
        status: {
          in: ['CONFIRMED', 'PENDING']
        }
      },
      select: {
        startTime: true,
        endTime: true
      },
      orderBy: { startTime: 'asc' }
    });
  }

  /**
   * Generate suggestions for a specific day
   */
  private async generateSuggestionsForDay(
    targetDate: Date,
    hostId: string,
    hostTimezone: string,
    userTimezone: string,
    durationMinutes: number,
    availabilityPatterns: any[],
    existingBookings: any[],
    preferences: AvailabilityPreference
  ): Promise<TimeSlotSuggestion[]> {
    const suggestions: TimeSlotSuggestion[] = [];
    const dayOfWeek = targetDate.getDay();
    const dateStr = TimezoneUtils.formatTimeInTimezone(targetDate, hostTimezone).split(' ')[0];
    
    // Get applicable availability patterns for this day
    const applicablePatterns = availabilityPatterns.filter(pattern => {
      if (pattern.type === 'RECURRING' && pattern.dayOfWeek === dayOfWeek) {
        return true;
      }
      if (pattern.type === 'DATE_SPECIFIC') {
        const patternDate = TimezoneUtils.formatTimeInTimezone(pattern.specificDate, hostTimezone).split(' ')[0];
        return patternDate === dateStr;
      }
      return false;
    });

    if (applicablePatterns.length === 0) {
      return suggestions;
    }

    // Get bookings for this specific day
    const dayBookings = existingBookings.filter(booking => {
      const bookingDate = TimezoneUtils.formatTimeInTimezone(booking.startTime, hostTimezone).split(' ')[0];
      return bookingDate === dateStr;
    });

    // Generate time slots for each availability pattern
    for (const pattern of applicablePatterns) {
      const patternSlots = await this.generateSlotsForPattern(
        targetDate,
        pattern,
        hostTimezone,
        userTimezone,
        durationMinutes,
        dayBookings,
        preferences
      );
      
      suggestions.push(...patternSlots);
    }

    return suggestions;
  }

  /**
   * Generate time slots for a specific availability pattern
   */
  private async generateSlotsForPattern(
    targetDate: Date,
    pattern: any,
    hostTimezone: string,
    userTimezone: string,
    durationMinutes: number,
    dayBookings: any[],
    preferences: AvailabilityPreference
  ): Promise<TimeSlotSuggestion[]> {
    const suggestions: TimeSlotSuggestion[] = [];
    const dateStr = TimezoneUtils.formatTimeInTimezone(targetDate, hostTimezone).split(' ')[0];
    
    // Parse pattern times
    const patternStart = TimezoneUtils.parseTimeInTimezone(`${dateStr}T${pattern.startTime}:00`, hostTimezone);
    const patternEnd = TimezoneUtils.parseTimeInTimezone(`${dateStr}T${pattern.endTime}:00`, hostTimezone);
    
    // Apply user's preferred time range if specified
    let effectiveStart = patternStart;
    let effectiveEnd = patternEnd;
    
    if (preferences.preferredTimeRange) {
      const preferredStart = TimezoneUtils.parseTimeInTimezone(
        `${dateStr}T${preferences.preferredTimeRange.start}:00`, 
        hostTimezone
      );
      const preferredEnd = TimezoneUtils.parseTimeInTimezone(
        `${dateStr}T${preferences.preferredTimeRange.end}:00`, 
        hostTimezone
      );
      
      effectiveStart = new Date(Math.max(patternStart.getTime(), preferredStart.getTime()));
      effectiveEnd = new Date(Math.min(patternEnd.getTime(), preferredEnd.getTime()));
    }
    
    // Generate slots every 15 minutes
    const slotInterval = 15 * 60 * 1000; // 15 minutes in milliseconds
    const slotDuration = durationMinutes * 60 * 1000; // Convert to milliseconds
    
    let currentTime = new Date(effectiveStart.getTime());
    
    // Ensure we don't suggest past times for today
    const now = new Date();
    if (currentTime < now) {
      // Round up to next 15-minute interval
      const minutesPastQuarter = now.getMinutes() % 15;
      const roundedTime = new Date(now);
      if (minutesPastQuarter > 0) {
        roundedTime.setMinutes(now.getMinutes() + (15 - minutesPastQuarter));
      }
      roundedTime.setSeconds(0);
      roundedTime.setMilliseconds(0);
      
      if (roundedTime > currentTime) {
        currentTime = roundedTime;
      }
    }
    
    while (currentTime.getTime() + slotDuration <= effectiveEnd.getTime()) {
      const slotEnd = new Date(currentTime.getTime() + slotDuration);
      
      // Check if this slot conflicts with existing bookings
      const hasConflict = dayBookings.some(booking =>
        TimezoneUtils.doTimesOverlap(currentTime, slotEnd, booking.startTime, booking.endTime)
      );
      
      if (!hasConflict) {
        const confidence = this.calculateSlotConfidence(currentTime, preferences, hostTimezone);
        
        suggestions.push({
          startTime: currentTime,
          endTime: slotEnd,
          confidence,
          reason: this.generateSlotReason(currentTime, confidence, hostTimezone),
          hostTimezone,
          userDisplayTime: TimezoneUtils.formatTimeInTimezone(currentTime, userTimezone)
        });
      }
      
      currentTime = new Date(currentTime.getTime() + slotInterval);
    }
    
    return suggestions;
  }

  /**
   * Calculate confidence score for a time slot (0-1)
   */
  private calculateSlotConfidence(
    slotTime: Date,
    preferences: AvailabilityPreference,
    hostTimezone: string
  ): number {
    let confidence = 0.5; // Base confidence
    
    const hour = parseInt(TimezoneUtils.formatTimeInTimezone(slotTime, hostTimezone, true).split(' ')[1].split(':')[0]);
    const dayOfWeek = slotTime.getDay();
    
    // Prefer business hours
    if (hour >= 9 && hour <= 17) {
      confidence += 0.3;
    } else if (hour >= 8 && hour <= 18) {
      confidence += 0.2;
    } else if (hour >= 7 && hour <= 19) {
      confidence += 0.1;
    }
    
    // Prefer weekdays
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      confidence += 0.2;
    }
    
    // Prefer mid-week
    if (dayOfWeek >= 2 && dayOfWeek <= 4) {
      confidence += 0.1;
    }
    
    // Prefer preferred time range
    if (preferences.preferredTimeRange) {
      const timeStr = TimezoneUtils.formatTimeInTimezone(slotTime, hostTimezone, true).split(' ')[1].substring(0, 5);
      if (timeStr >= preferences.preferredTimeRange.start && timeStr <= preferences.preferredTimeRange.end) {
        confidence += 0.2;
      }
    }
    
    // Reduce confidence for very early or very late bookings
    const now = new Date();
    const hoursUntilBooking = (slotTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilBooking < 2) {
      confidence -= 0.3; // Very short notice
    } else if (hoursUntilBooking < 24) {
      confidence -= 0.1; // Short notice
    } else if (hoursUntilBooking > 7 * 24) {
      confidence -= 0.1; // Very far in future
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate human-readable reason for slot suggestion
   */
  private generateSlotReason(slotTime: Date, confidence: number, hostTimezone: string): string {
    const hour = parseInt(TimezoneUtils.formatTimeInTimezone(slotTime, hostTimezone, true).split(' ')[1].split(':')[0]);
    const dayOfWeek = slotTime.getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    if (confidence > 0.8) {
      return `Optimal time - ${dayNames[dayOfWeek]} during business hours`;
    } else if (confidence > 0.6) {
      return `Good time - ${dayNames[dayOfWeek]} ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}`;
    } else if (confidence > 0.4) {
      return `Available time - ${dayNames[dayOfWeek]}`;
    } else {
      return `Available time - ${hour < 8 || hour > 18 ? 'outside typical business hours' : 'weekday'}`;
    }
  }

  /**
   * Get next available appointment slot (quick helper)
   */
  async getNextAvailableSlot(
    hostId: string,
    durationMinutes: number,
    userTimezone = 'UTC'
  ): Promise<TimeSlotSuggestion | null> {
    const suggestions = await this.getSmartSuggestions(hostId, durationMinutes, {}, userTimezone, 1);
    return suggestions.length > 0 ? suggestions[0] : null;
  }

  /**
   * Get available slots for a specific date range
   */
  async getAvailableSlotsInRange(
    hostId: string,
    startDate: Date,
    endDate: Date,
    durationMinutes: number,
    userTimezone = 'UTC'
  ): Promise<TimeSlotSuggestion[]> {
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return await this.getSmartSuggestions(
      hostId,
      durationMinutes,
      { maxDaysAhead: daysDiff },
      userTimezone,
      50 // More suggestions for range queries
    );
  }
}
