import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Request,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CalendarService } from './calendar.service';
import { PrismaService } from '../database/prisma.service';

@ApiTags('calendar-sync')
@Controller('calendar/sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CalendarSyncController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('booking/:bookingId')
  @ApiOperation({ summary: 'Sync booking to Google Calendar' })
  @ApiResponse({ status: 200, description: 'Booking synced to calendar successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 400, description: 'No calendar integration found' })
  async syncBookingToCalendar(
    @Request() req: any,
    @Param('bookingId') bookingId: string,
  ) {
    try {
      // Get the booking and verify ownership
      const booking = await this.prisma.booking.findFirst({
        where: {
          id: bookingId,
          OR: [
            { hostId: req.user.id },
            { meetingType: { hostId: req.user.id } },
          ],
        },
        include: {
          meetingType: true,
          host: true,
          calendarIntegration: true,
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found or access denied');
      }

      // Get user's active calendar integrations
      const allIntegrations = await this.calendarService.findAllIntegrations(req.user.id);
      const integrations = allIntegrations.filter(integration => integration.syncEnabled);
      
      if (integrations.length === 0) {
        throw new BadRequestException('No active calendar integrations found. Please connect a calendar first.');
      }

      // Use the first active integration (could be enhanced to let user choose)
      const integration = integrations[0];

      // Sync booking to calendar
      const result = await this.calendarService.syncBookingToCalendar(bookingId);

      return {
        success: true,
        message: 'Booking synced to calendar successfully',
        integration: {
          id: integration.id,
          name: integration.name,
          provider: integration.provider,
        },
      };
    } catch (error) {
      console.error('Error syncing booking to calendar:', error);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException(
        error.message || 'Failed to sync booking to calendar'
      );
    }
  }

  @Delete('booking/:bookingId')
  @ApiOperation({ summary: 'Remove booking from Google Calendar' })
  @ApiResponse({ status: 200, description: 'Booking removed from calendar successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async removeBookingFromCalendar(
    @Request() req: any,
    @Param('bookingId') bookingId: string,
  ) {
    try {
      // Get the booking and verify ownership
      const booking = await this.prisma.booking.findFirst({
        where: {
          id: bookingId,
          OR: [
            { hostId: req.user.id },
            { meetingType: { hostId: req.user.id } },
          ],
        },
        include: {
          calendarIntegration: true,
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found or access denied');
      }

      if (!booking.calendarIntegration) {
        return {
          success: true,
          message: 'Booking is not synced to any calendar',
        };
      }

      // Remove from synced calendar
      try {
        await this.calendarService.removeBookingFromCalendar(bookingId);
        
        return {
          success: true,
          message: 'Booking removed from calendar successfully',
          integration: {
            id: booking.calendarIntegration.id,
            name: booking.calendarIntegration.name,
            provider: booking.calendarIntegration.provider,
          },
        };
      } catch (error) {
        console.error('Failed to remove booking from calendar:', error);
        throw new InternalServerErrorException(
          error.message || 'Failed to remove booking from calendar'
        );
      }
    } catch (error) {
      console.error('Error removing booking from calendar:', error);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException(
        error.message || 'Failed to remove booking from calendar'
      );
    }
  }

  @Get('verify-event/:eventId')
  async verifyEvent(
    @Param('eventId') eventId: string,
    @Request() req: any
  ) {
    try {
      // Get user's active calendar integrations
      const allIntegrations = await this.calendarService.findAllIntegrations(req.user.id);
      const integrations = allIntegrations.filter(integration => integration.syncEnabled);
      
      if (integrations.length === 0) {
        throw new BadRequestException('No active calendar integrations found');
      }

      // Use the first active integration
      const integration = integrations[0];

      // Get event details from Google Calendar
      const eventDetails = await this.calendarService.getCalendarEvent(eventId, integration.calendarId);

      return {
        success: true,
        event: eventDetails
      };

    } catch (error) {
      console.error('Error verifying calendar event:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
