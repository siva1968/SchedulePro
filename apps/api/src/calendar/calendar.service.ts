import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCalendarIntegrationDto, UpdateCalendarIntegrationDto, CalendarSyncDto, CalendarQueryDto, CalendarProvider } from './dto';
import { GoogleCalendarService, GoogleCalendarEvent } from './google-calendar.service';
import { OutlookCalendarService, OutlookCalendarEvent } from './outlook-calendar.service';
import { CalDAVService } from './caldav.service';
import { EncryptionService } from './encryption.service';

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private googleCalendarService: GoogleCalendarService,
    private outlookCalendarService: OutlookCalendarService,
    private caldavService: CalDAVService,
    private encryptionService: EncryptionService,
  ) {}

  // Calendar Integration Management
  async createIntegration(userId: string, createDto: CreateCalendarIntegrationDto) {
    try {
      // Encrypt sensitive data
      const encryptedAccessToken = await this.encryptionService.encrypt(createDto.accessToken);
      const encryptedRefreshToken = createDto.refreshToken 
        ? await this.encryptionService.encrypt(createDto.refreshToken)
        : null;

      return await this.prisma.calendarIntegration.create({
        data: {
          userId,
          provider: createDto.provider as any,
          calendarId: createDto.calendarId || 'primary',
          name: createDto.name,
          description: createDto.description,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          isActive: true,
          syncEnabled: createDto.syncEnabled ?? true,
          conflictDetection: createDto.conflictDetection ?? true,
          timezone: createDto.timezone,
        },
      });
    } catch (error) {
      throw new BadRequestException(`Failed to create calendar integration: ${error.message}`);
    }
  }

  async findAllIntegrations(userId: string, query?: CalendarQueryDto) {
    const where: any = { userId };
    
    if (query?.provider) {
      where.provider = query.provider;
    }
    
    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return this.prisma.calendarIntegration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneIntegration(userId: string, id: string) {
    const integration = await this.prisma.calendarIntegration.findFirst({
      where: { id, userId },
    });

    if (!integration) {
      throw new NotFoundException('Calendar integration not found');
    }

    return integration;
  }

  async updateIntegration(userId: string, id: string, updateDto: UpdateCalendarIntegrationDto) {
    const integration = await this.findOneIntegration(userId, id);

    return this.prisma.calendarIntegration.update({
      where: { id },
      data: {
        name: updateDto.name,
        description: updateDto.description,
        accessToken: updateDto.accessToken,
        refreshToken: updateDto.refreshToken,
        calendarId: updateDto.calendarId,
        isActive: updateDto.isActive,
        syncEnabled: updateDto.syncEnabled,
        conflictDetection: updateDto.conflictDetection,
        timezone: updateDto.timezone,
      },
    });
  }

  async removeIntegration(userId: string, id: string) {
    await this.findOneIntegration(userId, id);

    return this.prisma.calendarIntegration.delete({
      where: { id },
    });
  }

  // Calendar Sync Operations (simplified)
  // Calendar sync methods
  async syncBookingToCalendar(bookingId: string, syncDto?: CalendarSyncDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        meetingType: {
          include: {
            host: true,
          },
        },
        attendees: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Get active calendar integrations for the host
    const integrations = await this.prisma.calendarIntegration.findMany({
      where: {
        userId: booking.meetingType.host.id,
        isActive: true,
        syncEnabled: true,
      },
    });

    const syncResults = [];

    for (const integration of integrations) {
      try {
        let eventId = null;
        
        // Decrypt access token
        const accessToken = await this.encryptionService.decrypt(integration.accessToken);

        if (integration.provider === CalendarProvider.GOOGLE) {
          // Create Google Calendar event
          const googleEvent: GoogleCalendarEvent = {
            summary: booking.title || `Meeting with ${booking.attendees[0]?.name}`,
            description: this.buildEventDescription(booking),
            start: {
              dateTime: booking.startTime.toISOString(),
              timeZone: integration.timezone || 'UTC',
            },
            end: {
              dateTime: booking.endTime.toISOString(),
              timeZone: integration.timezone || 'UTC',
            },
            attendees: booking.attendees.map(attendee => ({
              email: attendee.email,
              displayName: attendee.name,
            })),
            location: this.getEventLocation(booking),
            conferenceData: booking.locationType === 'ONLINE' ? {
              createRequest: {
                requestId: `booking-${bookingId}`,
                conferenceSolutionKey: {
                  type: 'hangoutsMeet',
                },
              },
            } : undefined,
          };

          const createdEvent = await this.googleCalendarService.createEvent(
            accessToken,
            integration.calendarId || 'primary',
            googleEvent,
          );

          eventId = createdEvent.id;
        }
        else if (integration.provider === CalendarProvider.OUTLOOK) {
          // Create Outlook Calendar event
          const outlookEvent: OutlookCalendarEvent = {
            subject: booking.title || `Meeting with ${booking.attendees[0]?.name}`,
            body: {
              contentType: 'HTML',
              content: this.buildEventDescription(booking),
            },
            start: {
              dateTime: booking.startTime.toISOString(),
              timeZone: integration.timezone || 'UTC',
            },
            end: {
              dateTime: booking.endTime.toISOString(),
              timeZone: integration.timezone || 'UTC',
            },
            attendees: booking.attendees.map(attendee => ({
              emailAddress: {
                address: attendee.email,
                name: attendee.name,
              },
              type: 'required' as const,
            })),
            location: booking.locationType !== 'ONLINE' ? {
              displayName: this.getEventLocation(booking),
            } : undefined,
            isOnlineMeeting: booking.locationType === 'ONLINE',
            onlineMeetingProvider: 'teamsForBusiness',
            showAs: 'busy',
            importance: 'normal',
          };

          const createdEvent = await this.outlookCalendarService.createEvent(
            accessToken,
            integration.calendarId || 'primary',
            outlookEvent,
          );

          eventId = createdEvent.id;
        }
        else if (integration.provider === CalendarProvider.CALDAV) {
          // Create CalDAV event
          const caldavCredentials = {
            serverUrl: integration.serverUrl || '',
            username: integration.username || '',
            password: await this.encryptionService.decrypt(integration.password || ''),
            calendarPath: integration.calendarId || '',
          };

          const caldavEvent = {
            summary: booking.title || `Meeting with ${booking.attendees[0]?.name}`,
            description: this.buildEventDescription(booking),
            dtstart: this.formatCalDAVDateTime(booking.startTime),
            dtend: this.formatCalDAVDateTime(booking.endTime),
            location: this.getEventLocation(booking),
            organizer: {
              name: booking.meetingType.host.firstName + ' ' + booking.meetingType.host.lastName,
              email: booking.meetingType.host.email,
            },
            attendees: booking.attendees.map(attendee => ({
              name: attendee.name,
              email: attendee.email,
              status: 'NEEDS-ACTION' as const,
            })),
            status: 'CONFIRMED' as const,
          };

          const createdEvent = await this.caldavService.createEvent(
            caldavCredentials,
            integration.calendarId || '',
            caldavEvent,
          );

          eventId = createdEvent.uid;
        }

        // Store the calendar event ID in the booking
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: {
            externalCalendarEventId: eventId,
            calendarIntegrationId: integration.id,
          },
        });

        syncResults.push({
          provider: integration.provider,
          success: true,
          eventId,
          integrationName: integration.name,
        });

      } catch (error) {
        console.error(`Failed to sync booking ${bookingId} to ${integration.provider}:`, error);
        
        syncResults.push({
          provider: integration.provider,
          success: false,
          error: error.message,
          integrationName: integration.name,
        });
      }
    }

    return syncResults;
  }

  async removeBookingFromCalendar(bookingId: string) {
    // Find the booking with its calendar integration
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        calendarIntegration: true,
      },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }

    if (!booking.calendarIntegration || !booking.externalCalendarEventId) {
      return {
        success: true,
        message: 'Booking is not synced to any calendar',
      };
    }

    try {
      if (booking.calendarIntegration.provider === CalendarProvider.GOOGLE) {
        // Delete from Google Calendar
        await this.googleCalendarService.deleteEvent(
          booking.calendarIntegration.accessToken,
          booking.calendarIntegration.calendarId || 'primary',
          booking.externalCalendarEventId,
        );
      }

      // Remove the calendar integration from the booking
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          externalCalendarEventId: null,
          calendarIntegrationId: null,
        },
      });

      return {
        success: true,
        provider: booking.calendarIntegration.provider,
        integrationName: booking.calendarIntegration.name,
      };

    } catch (error) {
      console.error(`Failed to remove booking ${bookingId} from ${booking.calendarIntegration.provider}:`, error);
      
      return {
        success: false,
        provider: booking.calendarIntegration.provider,
        error: error.message,
        integrationName: booking.calendarIntegration.name,
      };
    }
  }

  async checkConflicts(userId: string, startTime: string, endTime: string, integrationIds?: string[]) {
    const where: any = {
      userId,
      isActive: true,
      conflictDetection: true,
    };
    
    if (integrationIds && integrationIds.length > 0) {
      where.id = { in: integrationIds };
    }

    const integrations = await this.prisma.calendarIntegration.findMany({
      where,
    });

    const conflicts = [];

    for (const integration of integrations) {
      try {
        if (integration.provider === CalendarProvider.GOOGLE) {
          const googleConflicts = await this.googleCalendarService.checkConflicts(
            integration.accessToken,
            integration.calendarId || 'primary',
            startTime,
            endTime,
          );

          conflicts.push(...googleConflicts.map(conflict => ({
            ...conflict,
            integrationId: integration.id,
            integrationName: integration.name,
            provider: integration.provider,
          })));
        }
      } catch (error) {
        console.error(`Failed to check conflicts for ${integration.provider}:`, error);
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      checkedIntegrations: integrations.length,
      timeRange: {
        start: new Date(startTime),
        end: new Date(endTime),
      },
    };
  }

  // Helper methods
  private buildEventDescription(booking: any): string {
    let description = '';
    
    if (booking.description) {
      description += `${booking.description}\n\n`;
    }
    
    description += `Meeting Type: ${booking.meetingType.name}\n`;
    description += `Duration: ${booking.meetingType.duration} minutes\n`;
    
    if (booking.notes) {
      description += `\nNotes: ${booking.notes}`;
    }
    
    description += `\n\nBooked via SchedulePro`;
    
    return description;
  }

  private getEventLocation(booking: any): string | undefined {
    switch (booking.locationType) {
      case 'IN_PERSON':
        return booking.locationDetails?.address || 'In Person';
      case 'PHONE':
        return 'Phone Call';
      case 'ONLINE':
        return booking.meetingUrl || 'Online Meeting';
      default:
        return undefined;
    }
  }

  /**
   * Format date for CalDAV (YYYYMMDDTHHMMSSZ)
   */
  private formatCalDAVDateTime(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  // Helper methods for future calendar API integration
  private async validateCredentials(provider: CalendarProvider, accessToken: string) {
    return true;
  }
}
