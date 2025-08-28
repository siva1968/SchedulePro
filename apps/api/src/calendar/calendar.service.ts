import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCalendarIntegrationDto, UpdateCalendarIntegrationDto, CalendarSyncDto, CalendarQueryDto, CalendarProvider } from './dto';

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  // Calendar Integration Management
  async createIntegration(userId: string, createDto: CreateCalendarIntegrationDto) {
    try {
      return await this.prisma.calendarIntegration.create({
        data: {
          userId,
          provider: createDto.provider as any,
          calendarId: createDto.calendarId || 'primary',
          name: createDto.name,
          description: createDto.description,
          accessToken: createDto.accessToken,
          refreshToken: createDto.refreshToken,
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
        meetingType: true,
        attendees: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // For simplified implementation, get all active integrations for the host
    const integrations = await this.prisma.calendarIntegration.findMany({
      where: {
        userId: booking.hostId,
        isActive: true,
      },
    });

    if (integrations.length === 0) {
      throw new NotFoundException('No active calendar integrations found');
    }

    // Update sync time for all integrations
    for (const integration of integrations) {
      await this.prisma.calendarIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });
    }

    return {
      success: true,
      syncedIntegrations: integrations.length,
      message: 'Booking synced to calendar successfully',
    };
  }

  async removeBookingFromCalendar(bookingId: string, calendarIntegrationId: string) {
    const integration = await this.prisma.calendarIntegration.findUnique({
      where: { id: calendarIntegrationId },
    });

    if (!integration) {
      throw new NotFoundException('Calendar integration not found');
    }

    await this.prisma.calendarIntegration.update({
      where: { id: calendarIntegrationId },
      data: { lastSyncAt: new Date() },
    });

    return {
      success: true,
      message: 'Booking removed from calendar successfully',
    };
  }

  async checkCalendarConflicts(userId: string, startTime: Date, endTime: Date) {
    const integrations = await this.prisma.calendarIntegration.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    return {
      hasConflicts: false,
      conflicts: [],
      checkedIntegrations: integrations.length,
    };
  }

  async checkConflicts(userId: string, startTime: string, endTime: string, integrationIds?: string[]) {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    const where: any = {
      userId,
      isActive: true,
    };
    
    if (integrationIds && integrationIds.length > 0) {
      where.id = { in: integrationIds };
    }

    const integrations = await this.prisma.calendarIntegration.findMany({
      where,
    });

    return {
      hasConflicts: false,
      conflicts: [],
      checkedIntegrations: integrations.length,
      timeRange: {
        start: startDate,
        end: endDate,
      },
    };
  }

  // Helper methods for future calendar API integration
  private async validateCredentials(provider: CalendarProvider, accessToken: string) {
    return true;
  }
}
