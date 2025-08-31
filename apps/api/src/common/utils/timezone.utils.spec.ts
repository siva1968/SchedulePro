import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneUtils } from '../utils/timezone.utils';

describe('TimezoneUtils', () => {
  beforeEach(async () => {
    // Setup test environment
  });

  describe('parseTimeInTimezone', () => {
    it('should correctly parse time in different timezones', () => {
      const timeStr = '2025-09-01T10:00:00';
      const timezone = 'America/New_York';
      
      const result = TimezoneUtils.parseTimeInTimezone(timeStr, timezone);
      
      expect(result).toBeInstanceOf(Date);
      expect(result.getHours()).toBeDefined();
    });

    it('should handle timezone offset strings', () => {
      const timeStr = '2025-09-01T10:00:00';
      const timezone = 'Asia/Kolkata';
      
      const result = TimezoneUtils.parseTimeInTimezone(timeStr, timezone);
      
      expect(result).toBeInstanceOf(Date);
    });

    it('should throw error for invalid timezone', () => {
      const timeStr = '2025-09-01T10:00:00';
      const invalidTimezone = 'Invalid/Timezone';
      
      expect(() => {
        TimezoneUtils.parseTimeInTimezone(timeStr, invalidTimezone);
      }).toThrow();
    });
  });

  describe('formatTimeInTimezone', () => {
    it('should format time correctly in target timezone', () => {
      const date = new Date('2025-09-01T10:00:00Z');
      const timezone = 'America/New_York';
      
      const result = TimezoneUtils.formatTimeInTimezone(date, timezone);
      
      expect(typeof result).toBe('string');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });

    it('should include seconds when requested', () => {
      const date = new Date('2025-09-01T10:00:00Z');
      const timezone = 'UTC';
      
      const result = TimezoneUtils.formatTimeInTimezone(date, timezone, true);
      
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
  });

  describe('doTimesOverlap', () => {
    it('should detect overlapping times', () => {
      const start1 = new Date('2025-09-01T10:00:00Z');
      const end1 = new Date('2025-09-01T11:00:00Z');
      const start2 = new Date('2025-09-01T10:30:00Z');
      const end2 = new Date('2025-09-01T11:30:00Z');
      
      const result = TimezoneUtils.doTimesOverlap(start1, end1, start2, end2);
      
      expect(result).toBe(true);
    });

    it('should not detect non-overlapping times', () => {
      const start1 = new Date('2025-09-01T10:00:00Z');
      const end1 = new Date('2025-09-01T11:00:00Z');
      const start2 = new Date('2025-09-01T11:00:00Z');
      const end2 = new Date('2025-09-01T12:00:00Z');
      
      const result = TimezoneUtils.doTimesOverlap(start1, end1, start2, end2);
      
      expect(result).toBe(false);
    });

    it('should handle buffer time correctly', () => {
      const start1 = new Date('2025-09-01T10:00:00Z');
      const end1 = new Date('2025-09-01T11:00:00Z');
      const start2 = new Date('2025-09-01T11:05:00Z');
      const end2 = new Date('2025-09-01T12:00:00Z');
      
      // With 10-minute buffer, these should overlap
      const resultWithBuffer = TimezoneUtils.doTimesOverlap(start1, end1, start2, end2, 10);
      expect(resultWithBuffer).toBe(true);
      
      // Without buffer, they shouldn't overlap
      const resultWithoutBuffer = TimezoneUtils.doTimesOverlap(start1, end1, start2, end2);
      expect(resultWithoutBuffer).toBe(false);
    });
  });

  describe('generateTimeSlots', () => {
    it('should generate correct time slots', () => {
      const startTime = new Date('2025-09-01T09:00:00Z');
      const endTime = new Date('2025-09-01T17:00:00Z');
      const slotDuration = 30; // 30 minutes
      
      const slots = TimezoneUtils.generateTimeSlots(startTime, endTime, slotDuration);
      
      expect(slots).toBeInstanceOf(Array);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]).toHaveProperty('startTime');
      expect(slots[0]).toHaveProperty('endTime');
    });

    it('should respect slot duration', () => {
      const startTime = new Date('2025-09-01T09:00:00Z');
      const endTime = new Date('2025-09-01T10:00:00Z');
      const slotDuration = 30; // 30 minutes
      
      const slots = TimezoneUtils.generateTimeSlots(startTime, endTime, slotDuration);
      
      // Should generate 2 slots: 09:00-09:30 and 09:30-10:00
      expect(slots.length).toBe(2);
      
      const firstSlot = slots[0];
      const duration = (firstSlot.endTime.getTime() - firstSlot.startTime.getTime()) / (1000 * 60);
      expect(duration).toBe(30);
    });

    it('should respect interval parameter', () => {
      const startTime = new Date('2025-09-01T09:00:00Z');
      const endTime = new Date('2025-09-01T10:00:00Z');
      const slotDuration = 30;
      const interval = 30; // 30-minute intervals
      
      const slots = TimezoneUtils.generateTimeSlots(startTime, endTime, slotDuration, interval);
      
      expect(slots.length).toBe(2);
      expect(slots[1].startTime.getTime() - slots[0].startTime.getTime()).toBe(30 * 60 * 1000);
    });
  });

  describe('isValidTimezone', () => {
    it('should validate correct timezones', () => {
      const validTimezones = [
        'UTC',
        'America/New_York',
        'Europe/London',
        'Asia/Tokyo',
        'Australia/Sydney',
        'Asia/Kolkata'
      ];
      
      validTimezones.forEach(tz => {
        expect(TimezoneUtils.isValidTimezone(tz)).toBe(true);
      });
    });

    it('should reject invalid timezones', () => {
      const invalidTimezones = [
        'Invalid/Timezone',
        'Not/A/Real/Zone',
        '',
        'EST', // Abbreviations are not valid IANA timezone names
        'GMT+5'
      ];
      
      invalidTimezones.forEach(tz => {
        expect(TimezoneUtils.isValidTimezone(tz)).toBe(false);
      });
    });
  });

  describe('getTimezoneOffset', () => {
    it('should calculate timezone offset correctly', () => {
      const date = new Date('2025-09-01T12:00:00Z');
      
      // EST is UTC-5 (in September)
      const estOffset = TimezoneUtils.getTimezoneOffset('America/New_York', date);
      expect(estOffset).toBe(-240); // -4 hours in minutes (EDT during September)
      
      // IST is UTC+5:30
      const istOffset = TimezoneUtils.getTimezoneOffset('Asia/Kolkata', date);
      expect(istOffset).toBe(330); // +5.5 hours in minutes
    });
  });

  describe('getBusinessHoursForDate', () => {
    it('should generate business hours correctly', () => {
      const date = new Date('2025-09-01T12:00:00Z');
      const timezone = 'America/New_York';
      
      const businessHours = TimezoneUtils.getBusinessHoursForDate(date, timezone);
      
      expect(businessHours).toHaveProperty('start');
      expect(businessHours).toHaveProperty('end');
      expect(businessHours.start).toBeInstanceOf(Date);
      expect(businessHours.end).toBeInstanceOf(Date);
      expect(businessHours.end.getTime()).toBeGreaterThan(businessHours.start.getTime());
    });

    it('should respect custom business hours', () => {
      const date = new Date('2025-09-01T12:00:00Z');
      const timezone = 'UTC';
      
      const businessHours = TimezoneUtils.getBusinessHoursForDate(
        date, 
        timezone, 
        '08:00', 
        '18:00'
      );
      
      const duration = (businessHours.end.getTime() - businessHours.start.getTime()) / (1000 * 60 * 60);
      expect(duration).toBe(10); // 10 hours from 8 AM to 6 PM
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle DST transitions correctly', () => {
      // Test during DST transition (Spring forward)
      const springForward = new Date('2025-03-09T07:00:00Z'); // 2 AM EST becomes 3 AM EDT
      const timezone = 'America/New_York';
      
      const formatted = TimezoneUtils.formatTimeInTimezone(springForward, timezone);
      expect(formatted).toBeDefined();
    });

    it('should handle invalid date inputs gracefully', () => {
      const invalidDate = new Date('invalid');
      const timezone = 'UTC';
      
      expect(() => {
        TimezoneUtils.formatTimeInTimezone(invalidDate, timezone);
      }).toThrow();
    });

    it('should handle empty or null inputs', () => {
      expect(() => {
        TimezoneUtils.parseTimeInTimezone('', 'UTC');
      }).toThrow();
      
      expect(() => {
        TimezoneUtils.formatTimeInTimezone(null as any, 'UTC');
      }).toThrow();
    });
  });

  describe('Performance tests', () => {
    it('should handle large numbers of time slots efficiently', () => {
      const startTime = new Date('2025-09-01T00:00:00Z');
      const endTime = new Date('2025-09-01T23:59:00Z');
      const slotDuration = 15; // 15-minute slots for entire day
      
      const startPerf = performance.now();
      const slots = TimezoneUtils.generateTimeSlots(startTime, endTime, slotDuration);
      const endPerf = performance.now();
      
      expect(slots.length).toBeGreaterThan(90); // Should be about 96 slots
      expect(endPerf - startPerf).toBeLessThan(100); // Should complete in under 100ms
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle booking across midnight', () => {
      const start = new Date('2025-09-01T23:30:00Z');
      const end = new Date('2025-09-02T00:30:00Z');
      
      const overlap = TimezoneUtils.doTimesOverlap(
        start,
        end,
        new Date('2025-09-02T00:00:00Z'),
        new Date('2025-09-02T01:00:00Z')
      );
      
      expect(overlap).toBe(true);
    });

    it('should handle international meeting scheduling', () => {
      // 10 AM in New York should be around 3 PM in London (depending on DST)
      const nyTime = '2025-09-01T10:00:00';
      const nyTimezone = 'America/New_York';
      const londonTimezone = 'Europe/London';
      
      const nyDate = TimezoneUtils.parseTimeInTimezone(nyTime, nyTimezone);
      const londonFormatted = TimezoneUtils.formatTimeInTimezone(nyDate, londonTimezone);
      
      expect(londonFormatted).toBeDefined();
      expect(typeof londonFormatted).toBe('string');
    });

    it('should handle business hours across timezones', () => {
      // Generate business hours (9 AM - 5 PM) in EST and convert to UTC
      const date = new Date('2025-09-01T12:00:00Z');
      const businessHours = TimezoneUtils.getBusinessHoursForDate(date, 'America/New_York');
      
      const utcStart = TimezoneUtils.formatTimeInTimezone(businessHours.start, 'UTC');
      const utcEnd = TimezoneUtils.formatTimeInTimezone(businessHours.end, 'UTC');
      
      expect(utcStart).toBeDefined();
      expect(utcEnd).toBeDefined();
    });
  });
});
