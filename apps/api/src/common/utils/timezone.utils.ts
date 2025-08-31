import { BadRequestException } from '@nestjs/common';
import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

export class TimezoneUtils {
  /**
   * Validate timezone string
   */
  static isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convert local time string to UTC Date object
   * @param dateTimeString - Format: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
   * @param timezone - Target timezone (e.g., "Asia/Kolkata")
   */
  static parseTimeInTimezone(dateTimeString: string, timezone: string): Date {
    if (!this.isValidTimezone(timezone)) {
      throw new BadRequestException(`Invalid timezone: ${timezone}`);
    }

    // Ensure seconds are included
    let normalizedDateTime = dateTimeString;
    if (normalizedDateTime.length === 16) { // "YYYY-MM-DDTHH:mm"
      normalizedDateTime += ':00';
    }

    // Convert to UTC
    return zonedTimeToUtc(normalizedDateTime, timezone);
  }

  /**
   * Convert UTC Date to local time string in specified timezone
   */
  static formatTimeInTimezone(date: Date, timezone: string, includeSeconds = false): string {
    if (!this.isValidTimezone(timezone)) {
      throw new BadRequestException(`Invalid timezone: ${timezone}`);
    }

    const formatString = includeSeconds ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd HH:mm';
    return format(utcToZonedTime(date, timezone), formatString, { timeZone: timezone });
  }

  /**
   * Get user-friendly timezone label
   */
  static getTimezoneLabel(timezone: string): string {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        timeZoneName: 'short',
      });
      
      const parts = formatter.formatToParts(now);
      const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value || timezone;
      
      return `${timezone} (${timeZoneName})`;
    } catch {
      return timezone;
    }
  }

  /**
   * Calculate timezone offset in minutes
   */
  static getTimezoneOffset(timezone: string, date: Date = new Date()): number {
    if (!this.isValidTimezone(timezone)) {
      throw new BadRequestException(`Invalid timezone: ${timezone}`);
    }

    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
    
    return (localDate.getTime() - utcDate.getTime()) / (1000 * 60);
  }

  /**
   * Check if two times overlap (considering timezone)
   */
  static doTimesOverlap(
    start1: Date, end1: Date,
    start2: Date, end2: Date,
    bufferMinutes = 0
  ): boolean {
    const buffer = bufferMinutes * 60 * 1000; // Convert to milliseconds
    
    const bufferedStart1 = new Date(start1.getTime() - buffer);
    const bufferedEnd1 = new Date(end1.getTime() + buffer);
    
    return (
      (bufferedStart1 < end2 && bufferedEnd1 > start2) ||
      (start2 < bufferedEnd1 && end2 > bufferedStart1)
    );
  }

  /**
   * Generate time slots for a given time range
   */
  static generateTimeSlots(
    startTime: Date,
    endTime: Date,
    slotDurationMinutes: number,
    intervalMinutes = 15
  ): Array<{ startTime: Date; endTime: Date }> {
    const slots: Array<{ startTime: Date; endTime: Date }> = [];
    const slotDuration = slotDurationMinutes * 60 * 1000; // Convert to milliseconds
    const interval = intervalMinutes * 60 * 1000; // Convert to milliseconds
    
    let currentTime = new Date(startTime.getTime());
    
    while (currentTime.getTime() + slotDuration <= endTime.getTime()) {
      const slotEnd = new Date(currentTime.getTime() + slotDuration);
      
      slots.push({
        startTime: new Date(currentTime.getTime()),
        endTime: slotEnd
      });
      
      currentTime = new Date(currentTime.getTime() + interval);
    }
    
    return slots;
  }

  /**
   * Get business hours for a specific date and timezone
   */
  static getBusinessHoursForDate(
    date: Date,
    timezone: string,
    businessStart = '09:00',
    businessEnd = '17:00'
  ): { start: Date; end: Date } {
    const dateStr = format(utcToZonedTime(date, timezone), 'yyyy-MM-dd', { timeZone: timezone });
    
    const start = this.parseTimeInTimezone(`${dateStr}T${businessStart}:00`, timezone);
    const end = this.parseTimeInTimezone(`${dateStr}T${businessEnd}:00`, timezone);
    
    return { start, end };
  }
}
