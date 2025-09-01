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
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BookingsService } from './bookings.service';
import { CalendarService } from '../calendar/calendar.service';
import { CreateBookingDto, UpdateBookingDto, BookingQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/auth.decorators';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly calendarService: CalendarService,
  ) {}

  @Post('host')
  @Throttle(10, 60) // 10 host bookings per minute
  @ApiOperation({ summary: 'Create a host booking (authenticated, auto-confirmed)' })
  @ApiResponse({ status: 201, description: 'Host booking created and confirmed automatically' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Time slot conflict' })
  async createHostBooking(@Body() createBookingDto: CreateBookingDto, @Req() req: any) {
    console.log('👨‍💼 DEBUG - HOST BOOKING ENDPOINT CALLED');
    console.log('👨‍💼 DEBUG - User ID:', req.user?.id);
    console.log('👨‍💼 DEBUG - User email:', req.user?.email);
    console.log('👨‍💼 DEBUG - This should result in CONFIRMED status');
    
    try {
      console.log('👨‍💼 DEBUG - About to call bookingsService.create()');
      const result = await this.bookingsService.create(createBookingDto, req.user.id);
      console.log('👨‍💼 DEBUG - bookingsService.create() completed successfully');
      console.log('👨‍💼 DEBUG - Result type:', typeof result);
      console.log('👨‍💼 DEBUG - Result exists:', !!result);
      console.log('👨‍💼 DEBUG - Result ID:', result?.id);
      console.log('👨‍💼 DEBUG - About to return result to client');
      return result;
    } catch (error) {
      console.error('👨‍💼 ERROR - Controller caught error:', error);
      throw error;
    }
  }

  @Post()
  @Throttle(5, 60) // 5 bookings per minute
  @ApiOperation({ summary: 'Create a new booking' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Time slot conflict' })
  create(@Body() createBookingDto: CreateBookingDto, @Req() req: any) {
    console.log('🔐 DEBUG - GENERAL AUTHENTICATED BOOKING ENDPOINT CALLED');
    console.log('🔐 DEBUG - User ID:', req.user?.id);
    console.log('🔐 DEBUG - User email:', req.user?.email);
    console.log('🔐 DEBUG - This should result in CONFIRMED status');
    return this.bookingsService.create(createBookingDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bookings for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Bookings retrieved successfully' })
  findAll(@Query() query: BookingQueryDto, @Req() req: any) {
    return this.bookingsService.findAll(query, req.user.id);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming bookings for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Upcoming bookings retrieved successfully' })
  getUpcoming(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10', 
    @Req() req: any
  ) {
    return this.bookingsService.getUpcomingBookings(req.user.id, parseInt(page), parseInt(limit));
  }

  @Get('pending')
  @ApiOperation({ summary: 'Get pending bookings for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Pending bookings retrieved successfully' })
  async getPendingBookings(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Req() req: any
  ) {
    return this.bookingsService.getPendingBookings(req.user.id, parseInt(page), parseInt(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific booking by ID' })
  @ApiResponse({ status: 200, description: 'Booking retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.bookingsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a booking' })
  @ApiResponse({ status: 200, description: 'Booking updated successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - only host can update' })
  update(@Param('id') id: string, @Body() updateBookingDto: UpdateBookingDto, @Req() req: any) {
    return this.bookingsService.update(id, updateBookingDto, req.user.id);
  }

  @Post(':id/cancel')
  @Throttle(3, 60) // 3 cancellations per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  cancel(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Body('removeFromCalendar') removeFromCalendar: boolean,
    @Req() req: any,
  ) {
    return this.bookingsService.cancel(id, req.user.id, reason, removeFromCalendar);
  }

  @Post(':id/remove-from-calendar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove booking from calendar' })
  @ApiResponse({ status: 200, description: 'Booking removed from calendar successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async removeFromCalendar(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.calendarService.removeBookingFromCalendar(id);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reschedule a booking' })
  @ApiResponse({ status: 200, description: 'Booking rescheduled successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - only host can reschedule' })
  @ApiResponse({ status: 409, description: 'Time slot conflict' })
  reschedule(
    @Param('id') id: string,
    @Body('startTime') startTime: string,
    @Body('endTime') endTime: string,
    @Req() req: any,
  ) {
    return this.bookingsService.reschedule(id, startTime, endTime, req.user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending booking' })
  @ApiResponse({ status: 200, description: 'Booking approved successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - only host can approve' })
  async approveBooking(@Param('id') id: string, @Req() req: any) {
    return this.bookingsService.approveBooking(id, req.user.id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a pending booking' })
  @ApiResponse({ status: 200, description: 'Booking declined successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - only host can decline' })
  async declineBooking(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.bookingsService.declineBooking(id, req.user.id, reason);
  }
}

// Public controller for client booking pages
@ApiTags('public')
@Controller('public/bookings')
export class PublicBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Public()
  @Throttle(10, 300) // 10 public bookings per 5 minutes
  @ApiOperation({ summary: 'Create a public booking (no authentication required)' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Meeting type or host not found' })
  async createPublicBooking(@Body() createBookingDto: CreateBookingDto) {
    console.log('👤 DEBUG - PUBLIC BOOKING ENDPOINT CALLED');
    console.log('👤 DEBUG - This should result in PENDING status for approval');
    console.log('👤 DEBUG - Public booking creation called with:', createBookingDto.meetingTypeId);
    
    // Basic input validation for public endpoints
    if (!createBookingDto.meetingTypeId || !createBookingDto.startTime || !createBookingDto.endTime) {
      throw new BadRequestException('Missing required booking fields');
    }
    
    return this.bookingsService.createPublicBooking(createBookingDto);
  }

  @Get('available-slots')
  @Public()
  @ApiOperation({ summary: 'Get available time slots for public booking' })
  @ApiResponse({ status: 200, description: 'Available slots retrieved successfully' })
  async getAvailableSlots(
    @Query('meetingTypeId') meetingTypeId: string,
    @Query('date') date: string,
    @Query('timezone') timezone?: string,
    @Query('includeUnavailable') includeUnavailable?: string,
  ) {
    const result = await this.bookingsService.getAvailableSlotsForMeetingType(meetingTypeId, date, timezone);
    
    // If includeUnavailable is 'true', return all slots, otherwise just available slots
    if (includeUnavailable === 'true') {
      return result; // Return full result with availableSlots, unavailableSlots, and allSlots
    } else {
      return { availableSlots: result.availableSlots }; // Return only available slots for backward compatibility
    }
  }

  @Get('meeting-type/:id/providers')
  @Public()
  @ApiOperation({ summary: 'Get available meeting providers for a meeting type' })
  @ApiResponse({ status: 200, description: 'Meeting providers retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Meeting type not found' })
  async getMeetingProviders(@Param('id') meetingTypeId: string) {
    return this.bookingsService.getMeetingProvidersForMeetingType(meetingTypeId);
  }

  @Get(':id/reschedule')
  @Public()
  @Throttle(20, 300) // 20 requests per 5 minutes for viewing reschedule form
  @ApiOperation({ summary: 'Get booking details for reschedule form (public)' })
  @ApiResponse({ status: 200, description: 'Booking details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getBookingForReschedule(
    @Param('id') bookingId: string,
    @Query('token') token: string,
  ) {
    // Validate inputs
    if (!token || token.length < 10) {
      throw new BadRequestException('Invalid or missing token');
    }
    
    // Verify token and return booking details
    const booking = await this.bookingsService.getBookingForPublicAction(bookingId, token);
    return {
      id: booking.id,
      meetingType: booking.meetingType,
      startTime: booking.startTime,
      endTime: booking.endTime,
      attendees: booking.attendees,
      host: booking.host,
    };
  }

  @Post(':id/reschedule')
  @Public()
  @Throttle(5, 300) // 5 reschedules per 5 minutes
  @ApiOperation({ summary: 'Reschedule a booking (public)' })
  @ApiResponse({ status: 200, description: 'Booking rescheduled successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 400, description: 'Invalid token or time conflict' })
  async rescheduleBookingPublic(
    @Param('id') bookingId: string,
    @Body() body: { token: string; startTime: string; endTime: string },
  ) {
    // Validate inputs
    if (!body.token || body.token.length < 10) {
      throw new BadRequestException('Invalid or missing token');
    }
    
    if (!body.startTime || !body.endTime) {
      throw new BadRequestException('Missing start time or end time');
    }
    
    return this.bookingsService.rescheduleBookingPublic(bookingId, body.token, body.startTime, body.endTime);
  }

  @Get(':id/cancel')
  @Public()
  @Throttle(20, 300) // 20 requests per 5 minutes for viewing cancel form
  @ApiOperation({ summary: 'Get booking details for cancel form (public)' })
  @ApiResponse({ status: 200, description: 'Booking details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getBookingForCancel(
    @Param('id') bookingId: string,
    @Query('token') token: string,
  ) {
    // Validate inputs
    if (!token || token.length < 10) {
      throw new BadRequestException('Invalid or missing token');
    }
    
    // Verify token and return booking details
    const booking = await this.bookingsService.getBookingForPublicAction(bookingId, token);
    return {
      id: booking.id,
      meetingType: booking.meetingType,
      startTime: booking.startTime,
      endTime: booking.endTime,
      attendees: booking.attendees,
      host: booking.host,
    };
  }

  @Post(':id/cancel')
  @Public()
  @Throttle(5, 300) // 5 cancellations per 5 minutes
  @ApiOperation({ summary: 'Cancel a booking (public)' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 400, description: 'Invalid token' })
  async cancelBookingPublic(
    @Param('id') bookingId: string,
    @Body() body: { token: string; reason?: string; removeFromCalendar?: boolean },
  ) {
    // Validate inputs
    if (!body.token || body.token.length < 10) {
      throw new BadRequestException('Invalid or missing token');
    }
    
    return this.bookingsService.cancelBookingPublic(bookingId, body.token, body.reason, body.removeFromCalendar);
  }

  // ============================================================================
  // ENHANCED FUNCTIONALITY ENDPOINTS
  // ============================================================================

  @Get('smart-availability/:hostId')
  @ApiOperation({ summary: 'Get smart availability suggestions for a host' })
  @ApiResponse({ status: 200, description: 'Smart suggestions retrieved successfully' })
  async getSmartAvailability(
    @Param('hostId') hostId: string,
    @Query('duration') duration: number,
    @Query('timezone') timezone?: string,
    @Query('maxSuggestions') maxSuggestions?: number,
    @Query('preferredDays') preferredDays?: string,
    @Query('preferredTimeStart') preferredTimeStart?: string,
    @Query('preferredTimeEnd') preferredTimeEnd?: string,
  ) {
    const preferences: any = {};
    
    if (preferredDays) {
      preferences.preferredDays = preferredDays.split(',').map(d => parseInt(d));
    }
    
    if (preferredTimeStart && preferredTimeEnd) {
      preferences.preferredTimeRange = {
        start: preferredTimeStart,
        end: preferredTimeEnd
      };
    }

    return this.bookingsService.getSmartAvailabilitySlots(
      hostId,
      duration || 30,
      preferences,
      timezone || 'UTC',
      maxSuggestions || 10
    );
  }

  @Get('next-available/:hostId')
  @ApiOperation({ summary: 'Get next available time slot for a host' })
  @ApiResponse({ status: 200, description: 'Next available slot retrieved successfully' })
  async getNextAvailable(
    @Param('hostId') hostId: string,
    @Query('duration') duration: number,
    @Query('timezone') timezone?: string,
  ) {
    return this.bookingsService.getNextAvailableSlot(
      hostId,
      duration || 30,
      timezone || 'UTC'
    );
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Get analytics for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  async getHostAnalytics(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.bookingsService.getHostAnalytics(req.user.id, start, end);
  }

  @Get('analytics/system')
  @ApiOperation({ summary: 'Get system-wide analytics (admin only)' })
  @ApiResponse({ status: 200, description: 'System analytics retrieved successfully' })
  async getSystemAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.bookingsService.getSystemAnalytics(start, end);
  }

  @Post(':id/cancel-enhanced')
  @ApiOperation({ summary: 'Cancel a booking with enhanced notifications' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async cancelBookingEnhanced(
    @Param('id') bookingId: string,
    @Body() body: { reason?: string; sendNotifications?: boolean },
    @Req() req: any,
  ) {
    return this.bookingsService.cancelBookingEnhanced(
      bookingId,
      req.user.id,
      body.reason,
      body.sendNotifications !== false
    );
  }

  @Post(':id/reschedule-enhanced')
  @ApiOperation({ summary: 'Reschedule a booking with enhanced conflict detection' })
  @ApiResponse({ status: 200, description: 'Booking rescheduled successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'Time slot conflict' })
  async rescheduleBookingEnhanced(
    @Param('id') bookingId: string,
    @Body() body: { 
      newStartTime: string; 
      newEndTime: string; 
      reason?: string; 
    },
    @Req() req: any,
  ) {
    return this.bookingsService.rescheduleBookingEnhanced(
      bookingId,
      new Date(body.newStartTime),
      new Date(body.newEndTime),
      req.user.id,
      body.reason
    );
  }

  @Get('notification-timing/:hostId')
  @ApiOperation({ summary: 'Get optimal notification timing suggestions' })
  @ApiResponse({ status: 200, description: 'Notification timing suggestions retrieved' })
  async getOptimalNotificationTiming(
    @Param('hostId') hostId: string,
    @Body() bookingData?: any,
  ) {
    return this.bookingsService.getOptimalNotificationTiming(hostId, bookingData);
  }

}
