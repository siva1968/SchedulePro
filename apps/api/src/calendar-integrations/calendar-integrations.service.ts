import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CalendarService } from '../calendar/calendar.service';
import { CalendarProvider } from '@prisma/client';

export interface CreateCalendarIntegrationDto {
  provider: CalendarProvider;
  name: string;
  description?: string;
  accessToken: string;
  refreshToken?: string;
  calendarId?: string;
  timezone?: string;
  serverUrl?: string; // For CalDAV
  username?: string; // For CalDAV
  password?: string; // For CalDAV
  syncEnabled?: boolean;
  conflictDetection?: boolean;
}

export interface UpdateCalendarIntegrationDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  syncEnabled?: boolean;
  conflictDetection?: boolean;
  calendarId?: string;
  timezone?: string;
}

@Injectable()
export class CalendarIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
  ) {}

  /**
   * Create a new calendar integration
   */
  async create(userId: string, createDto: CreateCalendarIntegrationDto) {
    try {
      const integration = await this.prisma.calendarIntegration.create({
        data: {
          userId,
          provider: createDto.provider,
          name: createDto.name,
          description: createDto.description,
          accessToken: createDto.accessToken,
          refreshToken: createDto.refreshToken,
          calendarId: createDto.calendarId,
          timezone: createDto.timezone,
          serverUrl: createDto.serverUrl, // For CalDAV
          username: createDto.username, // For CalDAV
          password: createDto.password, // For CalDAV
          isActive: true,
          syncEnabled: createDto.syncEnabled ?? true,
          conflictDetection: createDto.conflictDetection ?? true,
        },
      });

      return integration;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Calendar integration already exists for this provider');
      }
      throw error;
    }
  }

  /**
   * Get all calendar integrations for a user
   */
  async findAllByUser(userId: string) {
    return this.prisma.calendarIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a specific calendar integration
   */
  async findOne(id: string, userId: string) {
    const integration = await this.prisma.calendarIntegration.findFirst({
      where: { id, userId },
    });

    if (!integration) {
      throw new NotFoundException('Calendar integration not found');
    }

    return integration;
  }

  /**
   * Update a calendar integration
   */
  async update(id: string, userId: string, updateDto: UpdateCalendarIntegrationDto) {
    const integration = await this.findOne(id, userId);

    return this.prisma.calendarIntegration.update({
      where: { id },
      data: {
        ...updateDto,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Delete a calendar integration
   */
  async remove(id: string, userId: string): Promise<void> {
    const integration = await this.findOne(id, userId);

    await this.prisma.calendarIntegration.delete({
      where: { id },
    });
  }

  /**
   * Sync calendar events for an integration
   */
  async syncCalendar(id: string, userId: string): Promise<{
    success: boolean;
    syncedEvents: number;
    errors: string[];
  }> {
    const integration = await this.findOne(id, userId);

    if (!integration.isActive || !integration.syncEnabled) {
      throw new BadRequestException('Calendar integration is not active or sync is disabled');
    }

    try {
      let syncedEvents = 0;
      const errors: string[] = [];

      // Use CalendarService to perform the sync
      switch (integration.provider) {
        case 'GOOGLE':
          syncedEvents = await this.syncGoogleCalendar(integration);
          break;
        case 'OUTLOOK':
          syncedEvents = await this.syncOutlookCalendar(integration);
          break;
        case 'CALDAV':
          syncedEvents = await this.syncCalDAVCalendar(integration);
          break;
        default:
          throw new BadRequestException('Unsupported calendar provider');
      }

      // Update last sync time
      await this.prisma.calendarIntegration.update({
        where: { id },
        data: { lastSyncAt: new Date() },
      });

      return {
        success: true,
        syncedEvents,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        syncedEvents: 0,
        errors: [error.message],
      };
    }
  }

  /**
   * Get integration status and health
   */
  async getIntegrationStatus(id: string, userId: string): Promise<{
    isActive: boolean;
    isConnected: boolean;
    lastSyncAt?: Date;
    syncEnabled: boolean;
    healthCheck: {
      canConnect: boolean;
      tokenValid: boolean;
      lastError?: string;
    };
  }> {
    const integration = await this.findOne(id, userId);

    // Perform health checks
    const healthCheck = await this.performHealthCheck(integration);

    return {
      isActive: integration.isActive,
      isConnected: healthCheck.canConnect,
      lastSyncAt: integration.lastSyncAt,
      syncEnabled: integration.syncEnabled,
      healthCheck,
    };
  }

  /**
   * Test connection for an integration
   */
  async testConnection(id: string, userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const integration = await this.findOne(id, userId);

    try {
      let success = false;
      let message = '';

      switch (integration.provider) {
        case 'GOOGLE':
          // Test Google Calendar connection
          success = await this.testGoogleConnection(integration);
          message = success ? 'Google Calendar connection successful' : 'Google Calendar connection failed';
          break;
        case 'OUTLOOK':
          // Test Outlook connection
          success = await this.testOutlookConnection(integration);
          message = success ? 'Outlook Calendar connection successful' : 'Outlook Calendar connection failed';
          break;
        case 'CALDAV':
          // Test CalDAV connection
          success = await this.testCalDAVConnection(integration);
          message = success ? 'CalDAV connection successful' : 'CalDAV connection failed';
          break;
        default:
          throw new BadRequestException('Unsupported calendar provider');
      }

      return { success, message };
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  /**
   * Private helper methods
   */
  private async performHealthCheck(integration: any): Promise<{
    canConnect: boolean;
    tokenValid: boolean;
    lastError?: string;
  }> {
    try {
      let canConnect = false;

      switch (integration.provider) {
        case 'GOOGLE':
          canConnect = await this.testGoogleConnection(integration);
          break;
        case 'OUTLOOK':
          canConnect = await this.testOutlookConnection(integration);
          break;
        case 'CALDAV':
          canConnect = await this.testCalDAVConnection(integration);
          break;
      }

      return {
        canConnect,
        tokenValid: canConnect,
      };
    } catch (error) {
      return {
        canConnect: false,
        tokenValid: false,
        lastError: error.message,
      };
    }
  }

  private async testGoogleConnection(integration: any): Promise<boolean> {
    try {
      // Use Google Calendar service to test connection
      // This is a placeholder - would integrate with actual GoogleCalendarService
      return true;
    } catch (error) {
      return false;
    }
  }

  private async testOutlookConnection(integration: any): Promise<boolean> {
    try {
      // Use Outlook Calendar service to test connection
      // This is a placeholder - would integrate with actual OutlookCalendarService
      return true;
    } catch (error) {
      return false;
    }
  }

  private async testCalDAVConnection(integration: any): Promise<boolean> {
    try {
      // Use CalDAV service to test connection
      // This is a placeholder - would integrate with actual CalDAVService
      return true;
    } catch (error) {
      return false;
    }
  }

  private async syncGoogleCalendar(integration: any): Promise<number> {
    // Implementation for Google Calendar sync
    // This would use the GoogleCalendarService
    return 0; // Placeholder
  }

  private async syncOutlookCalendar(integration: any): Promise<number> {
    // Implementation for Outlook Calendar sync
    // This would use the OutlookCalendarService
    return 0; // Placeholder
  }

  private async syncCalDAVCalendar(integration: any): Promise<number> {
    // Implementation for CalDAV sync
    // This would use the CalDAVService
    return 0; // Placeholder
  }
}
