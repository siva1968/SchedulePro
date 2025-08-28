import { Injectable, Logger } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { GoogleCalendarService } from './google-calendar.service';
import { OutlookCalendarService } from './outlook-calendar.service';
import { CalDAVService } from './caldav.service';
import { EncryptionService } from './encryption.service';

export interface CalendarConflict {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  provider: string;
  calendarName: string;
  location?: string;
  status?: string;
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: CalendarConflict[];
  checkedIntegrations: Array<{
    id: string;
    name: string;
    provider: string;
    success: boolean;
    error?: string;
  }>;
}

@Injectable()
export class ConflictDetectionService {
  private readonly logger = new Logger(ConflictDetectionService.name);

  constructor(
    private calendarService: CalendarService,
    private googleCalendarService: GoogleCalendarService,
    private outlookCalendarService: OutlookCalendarService,
    private caldavService: CalDAVService,
    private encryptionService: EncryptionService,
  ) {}

  /**
   * Check for conflicts across all active calendar integrations
   */
  async checkConflicts(
    userId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ): Promise<ConflictCheckResult> {
    const result: ConflictCheckResult = {
      hasConflicts: false,
      conflicts: [],
      checkedIntegrations: [],
    };

    try {
      // Get all active integrations with conflict detection enabled
      const integrations = await this.calendarService.findAllIntegrations(userId);
      const activeIntegrations = integrations.filter(
        integration => 
          integration.isActive && 
          integration.conflictDetection &&
          integration.accessToken
      );

      if (activeIntegrations.length === 0) {
        this.logger.warn(`No active calendar integrations found for user ${userId}`);
        return result;
      }

      // Check each integration for conflicts
      const conflictPromises = activeIntegrations.map(async (integration) => {
        const integrationResult = {
          id: integration.id,
          name: integration.name,
          provider: integration.provider,
          success: false,
          error: undefined as string | undefined,
        };

        try {
          const conflicts = await this.checkIntegrationConflicts(
            integration,
            startTime,
            endTime,
            excludeBookingId,
          );

          integrationResult.success = true;
          return { integrationResult, conflicts };
        } catch (error) {
          this.logger.error(`Conflict check failed for integration ${integration.name}:`, error);
          integrationResult.error = error.message;
          return { integrationResult, conflicts: [] };
        }
      });

      const results = await Promise.allSettled(conflictPromises);
      
      results.forEach((promiseResult) => {
        if (promiseResult.status === 'fulfilled') {
          const { integrationResult, conflicts } = promiseResult.value;
          result.checkedIntegrations.push(integrationResult);
          result.conflicts.push(...conflicts);
        } else {
          this.logger.error('Conflict check promise failed:', promiseResult.reason);
        }
      });

      result.hasConflicts = result.conflicts.length > 0;

      this.logger.log(
        `Conflict check for user ${userId}: ${result.conflicts.length} conflicts found across ${result.checkedIntegrations.length} integrations`
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to check calendar conflicts:', error);
      throw error;
    }
  }

  /**
   * Check for conflicts in a specific calendar integration
   */
  private async checkIntegrationConflicts(
    integration: any,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ): Promise<CalendarConflict[]> {
    const conflicts: CalendarConflict[] = [];

    try {
      let events: any[] = [];

      // Decrypt access token
      const accessToken = await this.encryptionService.decrypt(integration.accessToken);

      // Get events based on provider
      switch (integration.provider) {
        case 'GOOGLE':
          events = await this.googleCalendarService.getEvents(
            accessToken,
            integration.calendarId || 'primary',
            startTime.toISOString(),
            endTime.toISOString(),
          );
          break;

        case 'OUTLOOK':
          events = await this.outlookCalendarService.getEvents(
            accessToken,
            integration.calendarId || 'primary',
            startTime.toISOString(),
            endTime.toISOString(),
          );
          break;

        case 'CALDAV':
          // For CalDAV, we need the full credentials
          const credentials = {
            serverUrl: integration.serverUrl || '',
            username: integration.username || '',
            password: await this.encryptionService.decrypt(integration.password || ''),
            calendarPath: integration.calendarId || '',
          };

          const caldavEvents = await this.caldavService.getEvents(
            credentials,
            integration.calendarId || '',
            startTime.toISOString(),
            endTime.toISOString(),
          );

          // Convert CalDAV events to standard format
          events = caldavEvents.map(event => ({
            id: event.uid,
            summary: event.summary,
            start: { dateTime: event.startTime.toISOString() },
            end: { dateTime: event.endTime.toISOString() },
          }));
          break;

        default:
          this.logger.warn(`Unknown calendar provider: ${integration.provider}`);
          return conflicts;
      }

      // Process events and check for overlaps
      for (const event of events) {
        if (this.isEventConflicting(event, startTime, endTime, excludeBookingId)) {
          conflicts.push(this.mapEventToConflict(event, integration));
        }
      }

      return conflicts;
    } catch (error) {
      this.logger.error(`Failed to check conflicts for ${integration.provider} integration:`, error);
      throw error;
    }
  }

  /**
   * Check if an event conflicts with the proposed time slot
   */
  private isEventConflicting(
    event: any,
    proposedStart: Date,
    proposedEnd: Date,
    excludeBookingId?: string,
  ): boolean {
    try {
      // Skip if this is the same booking we're updating
      if (excludeBookingId && event.description?.includes(excludeBookingId)) {
        return false;
      }

      // Skip cancelled events
      if (event.status === 'cancelled' || event.isCancelled) {
        return false;
      }

      // Skip transparent/free events
      if (event.transparency === 'transparent' || event.showAs === 'free') {
        return false;
      }

      // Get event times
      let eventStart: Date;
      let eventEnd: Date;

      if (event.start?.dateTime) {
        eventStart = new Date(event.start.dateTime);
      } else if (event.start?.date) {
        // All-day event
        eventStart = new Date(event.start.date);
      } else {
        return false; // Can't determine start time
      }

      if (event.end?.dateTime) {
        eventEnd = new Date(event.end.dateTime);
      } else if (event.end?.date) {
        // All-day event
        eventEnd = new Date(event.end.date);
      } else {
        return false; // Can't determine end time
      }

      // Check for overlap
      // Events overlap if: proposedStart < eventEnd AND proposedEnd > eventStart
      const hasOverlap = proposedStart < eventEnd && proposedEnd > eventStart;

      if (hasOverlap) {
        this.logger.debug(
          `Conflict detected: ${event.summary || event.subject} (${eventStart.toISOString()} - ${eventEnd.toISOString()})`
        );
      }

      return hasOverlap;
    } catch (error) {
      this.logger.error('Error checking event conflict:', error);
      return false; // Assume no conflict if we can't parse the event
    }
  }

  /**
   * Map external calendar event to conflict object
   */
  private mapEventToConflict(event: any, integration: any): CalendarConflict {
    const startTime = event.start?.dateTime 
      ? new Date(event.start.dateTime)
      : new Date(event.start?.date || '');
    
    const endTime = event.end?.dateTime 
      ? new Date(event.end.dateTime)
      : new Date(event.end?.date || '');

    return {
      id: event.id || event.uid,
      title: event.summary || event.subject || 'Untitled Event',
      startTime,
      endTime,
      provider: integration.provider,
      calendarName: integration.name,
      location: event.location?.displayName || event.location || '',
      status: event.status || event.showAs || 'busy',
    };
  }

  /**
   * Check if a specific time slot is available
   */
  async isTimeSlotAvailable(
    userId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const conflictResult = await this.checkConflicts(userId, startTime, endTime, excludeBookingId);
    return !conflictResult.hasConflicts;
  }

  /**
   * Get suggested alternative time slots when conflicts exist
   */
  async suggestAlternativeTimeSlots(
    userId: string,
    preferredStart: Date,
    duration: number, // in minutes
    searchRange: number = 7, // days to search
    maxSuggestions: number = 5,
  ): Promise<Date[]> {
    const suggestions: Date[] = [];
    const durationMs = duration * 60 * 1000;
    const searchRangeMs = searchRange * 24 * 60 * 60 * 1000;

    // Start searching from the preferred time
    let currentTime = new Date(preferredStart);
    const endSearchTime = new Date(preferredStart.getTime() + searchRangeMs);

    while (currentTime < endSearchTime && suggestions.length < maxSuggestions) {
      const slotEnd = new Date(currentTime.getTime() + durationMs);

      // Skip if outside business hours (9 AM - 6 PM)
      const hour = currentTime.getHours();
      if (hour >= 9 && hour < 18) {
        const isAvailable = await this.isTimeSlotAvailable(userId, currentTime, slotEnd);
        
        if (isAvailable) {
          suggestions.push(new Date(currentTime));
        }
      }

      // Move to next 30-minute slot
      currentTime = new Date(currentTime.getTime() + 30 * 60 * 1000);
    }

    return suggestions;
  }
}
