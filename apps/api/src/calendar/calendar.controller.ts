import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { CreateCalendarIntegrationDto, UpdateCalendarIntegrationDto, CalendarSyncDto, CalendarQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('integrations')
  @ApiOperation({ summary: 'Create a new calendar integration' })
  @ApiResponse({ status: 201, description: 'Calendar integration created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createIntegration(
    @Request() req: any,
    @Body() createDto: CreateCalendarIntegrationDto,
  ) {
    return this.calendarService.createIntegration(req.user.id, createDto);
  }

  @Get('integrations')
  @ApiOperation({ summary: 'Get all calendar integrations for the current user' })
  @ApiResponse({ status: 200, description: 'Calendar integrations retrieved successfully' })
  async findAllIntegrations(
    @Request() req: any,
    @Query() query: CalendarQueryDto,
  ) {
    return this.calendarService.findAllIntegrations(req.user.id, query);
  }

  @Get('integrations/:id')
  @ApiOperation({ summary: 'Get a calendar integration by ID' })
  @ApiResponse({ status: 200, description: 'Calendar integration retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async findOneIntegration(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.calendarService.findOneIntegration(req.user.id, id);
  }

  @Patch('integrations/:id')
  @ApiOperation({ summary: 'Update a calendar integration' })
  @ApiResponse({ status: 200, description: 'Calendar integration updated successfully' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async updateIntegration(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateCalendarIntegrationDto,
  ) {
    return this.calendarService.updateIntegration(req.user.id, id, updateDto);
  }

  @Delete('integrations/:id')
  @ApiOperation({ summary: 'Delete a calendar integration' })
  @ApiResponse({ status: 200, description: 'Calendar integration deleted successfully' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async removeIntegration(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.calendarService.removeIntegration(req.user.id, id);
  }

  @Post('sync/:bookingId')
  @ApiOperation({ summary: 'Sync a booking to connected calendars' })
  @ApiResponse({ status: 200, description: 'Booking synced to calendars successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async syncBookingToCalendar(
    @Request() req: any,
    @Param('bookingId') bookingId: string,
    @Body() syncDto?: CalendarSyncDto,
  ) {
    return this.calendarService.syncBookingToCalendar(bookingId, syncDto);
  }

  @Delete('booking/:bookingId/:integrationId')
  @ApiOperation({ summary: 'Remove a booking from a specific calendar integration' })
  @ApiResponse({ status: 200, description: 'Booking removed from calendar successfully' })
  @ApiResponse({ status: 404, description: 'Booking or integration not found' })
  async removeBookingFromCalendar(
    @Request() req: any,
    @Param('bookingId') bookingId: string,
    @Param('integrationId') integrationId: string,
  ) {
    return this.calendarService.removeBookingFromCalendar(bookingId);
  }

  @Get('conflicts')
  @ApiOperation({ summary: 'Check for calendar conflicts in a time range' })
  @ApiResponse({ status: 200, description: 'Conflicts checked successfully' })
  async checkConflicts(
    @Request() req: any,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('integrationIds') integrationIds?: string,
  ) {
    const integrationIdArray = integrationIds ? integrationIds.split(',') : undefined;
    return this.calendarService.checkConflicts(req.user.id, startTime, endTime, integrationIdArray);
  }
}
