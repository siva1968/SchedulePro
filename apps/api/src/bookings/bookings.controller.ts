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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingDto, BookingQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/auth.decorators';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new booking' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Time slot conflict' })
  create(@Body() createBookingDto: CreateBookingDto, @Req() req: any) {
    console.log('DEBUG - Booking controller req.user:', req.user);
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
  getUpcoming(@Query('limit') limit: string = '10', @Req() req: any) {
    return this.bookingsService.getUpcomingBookings(req.user.id, parseInt(limit));
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  cancel(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.bookingsService.cancel(id, req.user.id, reason);
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
}

// Public controller for client booking pages
@ApiTags('public')
@Controller('public/bookings')
export class PublicBookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Create a public booking (no authentication required)' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Meeting type or host not found' })
  async createPublicBooking(@Body() createBookingDto: CreateBookingDto) {
    console.log('DEBUG - Public booking creation called with:', createBookingDto);
    return this.bookingsService.createPublicBooking(createBookingDto);
  }

  @Get('available-slots')
  @Public()
  @ApiOperation({ summary: 'Get available time slots for public booking' })
  @ApiResponse({ status: 200, description: 'Available slots retrieved successfully' })
  async getAvailableSlots(
    @Query('meetingTypeId') meetingTypeId: string,
    @Query('date') date: string,
  ) {
    return this.bookingsService.getAvailableSlotsForMeetingType(meetingTypeId, date);
  }

  @Get('meeting-type/:id/providers')
  @Public()
  @ApiOperation({ summary: 'Get available meeting providers for a meeting type' })
  @ApiResponse({ status: 200, description: 'Meeting providers retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Meeting type not found' })
  async getMeetingProviders(@Param('id') meetingTypeId: string) {
    return this.bookingsService.getMeetingProvidersForMeetingType(meetingTypeId);
  }
}
