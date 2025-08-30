import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { CalendarService } from '../calendar/calendar.service';
import { CreateBookingDto, UpdateBookingDto, BookingQueryDto } from './dto';
import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
  ) {}

  async create(createBookingDto: CreateBookingDto, hostId: string): Promise<any> {
    const { attendees, ...bookingData } = createBookingDto;

    console.log('DEBUG - Create booking called with:', {
      createBookingDto,
      bookingData,
      hostId,
      rawStartTime: createBookingDto.startTime,
      rawEndTime: createBookingDto.endTime,
      parsedStartTime: new Date(createBookingDto.startTime),
      parsedEndTime: new Date(createBookingDto.endTime)
    });

    // Validate meeting type exists and is accessible
    const meetingType = await this.prisma.meetingType.findFirst({
      where: {
        id: createBookingDto.meetingTypeId,
        OR: [
          { hostId: hostId },
          { organization: { members: { some: { userId: hostId } } } },
        ],
      },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found or not accessible');
    }

    // Validate that the host user is active and available for bookings
    const hostUser = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { 
        id: true, 
        isActive: true, 
        firstName: true, 
        lastName: true 
      },
    });

    if (!hostUser) {
      throw new NotFoundException('Host user not found');
    }

    if (!hostUser.isActive) {
      throw new BadRequestException('This user is currently not accepting bookings. Please try again later.');
    }

    // Validate and potentially fix end time based on meeting type duration
    const startDateTime = new Date(createBookingDto.startTime);
    const providedEndDateTime = new Date(createBookingDto.endTime);
    const calculatedEndDateTime = new Date(startDateTime.getTime() + meetingType.duration * 60000);
    
    console.log('DEBUG - Time validation:', {
      startDateTime: startDateTime.toISOString(),
      providedEndDateTime: providedEndDateTime.toISOString(),
      calculatedEndDateTime: calculatedEndDateTime.toISOString(),
      isEndTimeValid: providedEndDateTime.getTime() === calculatedEndDateTime.getTime(),
      providedDuration: (providedEndDateTime.getTime() - startDateTime.getTime()) / 60000,
      expectedDuration: meetingType.duration
    });

    // If the provided end time doesn't match the expected duration, use calculated end time
    let finalEndTime = createBookingDto.endTime;
    if (providedEndDateTime.getTime() !== calculatedEndDateTime.getTime()) {
      console.log('DEBUG - End time mismatch detected, using calculated end time');
      finalEndTime = calculatedEndDateTime.toISOString().substring(0, 16); // Format: YYYY-MM-DDTHH:MM
      
      // Update the booking data with corrected end time
      bookingData.endTime = finalEndTime;
      createBookingDto.endTime = finalEndTime;
      
      console.log('DEBUG - Updated booking data with corrected end time:', {
        originalEndTime: createBookingDto.endTime,
        correctedEndTime: finalEndTime
      });
    }

    console.log('DEBUG - About to check time conflicts...');

    // Get the host's timezone for proper time parsing
    const hostForTimezone = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { timezone: true }
    });

    const hostTimezone = hostForTimezone?.timezone || 'Asia/Kolkata';

    // Parse times as being in the host's timezone (same as getAvailableSlots)
    // If the time string doesn't have timezone info, add the host's timezone
    let startTimeStr = createBookingDto.startTime;
    let endTimeStr = createBookingDto.endTime;

    // If the time string doesn't have timezone info, treat it as being in host timezone
    if (!startTimeStr.includes('+') && !startTimeStr.includes('Z') && !startTimeStr.includes('-')) {
      // Add seconds if not present
      if (startTimeStr.length === 16) { // "2025-09-01T11:00"
        startTimeStr += ':00';
      }
      if (endTimeStr.length === 16) {
        endTimeStr += ':00';
      }
      
      // Add IST timezone offset
      startTimeStr += '+05:30';
      endTimeStr += '+05:30';
    }

    const startTimeWithTz = new Date(startTimeStr);
    const endTimeWithTz = new Date(endTimeStr);

    console.log('DEBUG - Timezone-aware time parsing:', {
      originalStartTime: createBookingDto.startTime,
      originalEndTime: createBookingDto.endTime,
      hostTimezone,
      parsedStartTime: startTimeWithTz.toISOString(),
      parsedEndTime: endTimeWithTz.toISOString(),
    });

    // Check for time conflicts
    try {
      await this.checkTimeConflicts(
        hostId,
        startTimeWithTz,
        endTimeWithTz,
      );
      console.log('DEBUG - Time conflict check passed, proceeding...');
    } catch (error) {
      console.log('DEBUG - Time conflict detected:', error.message);
      throw error;
    }

    // Validate time slot availability
    await this.validateTimeSlot(
      hostId,
      startTimeWithTz,
      endTimeWithTz,
      meetingType,
    );

    try {
      const booking = await this.prisma.booking.create({
        data: {
          ...bookingData,
          startTime: startTimeWithTz,
          endTime: endTimeWithTz,
          hostId,
          status: BookingStatus.CONFIRMED,
          attendees: {
            create: attendees.map((attendee) => ({
              ...attendee,
              status: 'CONFIRMED',
            })),
          },
        },
        include: {
          attendees: true,
          meetingType: true,
          host: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Send email notifications
      try {
        await Promise.all([
          this.emailService.sendBookingConfirmation(booking),
          this.emailService.sendBookingNotificationToHost(booking),
        ]);
      } catch (emailError) {
        console.error('Failed to send booking notification emails:', emailError);
        // Don't fail the booking creation if email fails
      }

      return booking;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Booking conflict detected');
      }
      throw error;
    }
  }

  async findAll(query: BookingQueryDto, userId: string): Promise<{
    bookings: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, ...filters } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { hostId: userId },
        { attendees: { some: { userId } } },
      ],
    };

    // Apply filters
    if (filters.meetingTypeId) {
      where.meetingTypeId = filters.meetingTypeId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.hostId) {
      where.hostId = filters.hostId;
    }

    if (filters.attendeeEmail) {
      where.attendees = {
        some: {
          email: {
            contains: filters.attendeeEmail,
            mode: 'insensitive',
          },
        },
      };
    }

    if (filters.startDate || filters.endDate) {
      where.startTime = {};
      if (filters.startDate) {
        where.startTime.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.startTime.lte = new Date(filters.endDate);
      }
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          {
            status: 'asc', // PENDING, CONFIRMED, CANCELLED, RESCHEDULED, COMPLETED, NO_SHOW
          },
          {
            startTime: 'desc', // Then by start time within each status group
          },
        ],
        include: {
          attendees: true,
          meetingType: {
            select: {
              id: true,
              name: true,
              duration: true,
              price: true,
            },
          },
          host: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      bookings,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, userId: string): Promise<any> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id,
        OR: [
          { hostId: userId },
          { attendees: { some: { userId } } },
        ],
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  async update(id: string, updateBookingDto: UpdateBookingDto, userId: string): Promise<any> {
    const booking = await this.findOne(id, userId);

    // Only host can update booking details
    if (booking.hostId !== userId) {
      throw new ForbiddenException('Only the host can update booking details');
    }

    // Handle status changes with business logic
    if (updateBookingDto.status && updateBookingDto.status !== booking.status) {
      await this.handleStatusChange(booking, updateBookingDto.status);
    }

    const { attendees, ...updateData } = updateBookingDto;

    return await this.prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async cancel(id: string, userId: string, reason?: string, removeFromCalendar?: boolean): Promise<any> {
    const booking = await this.findOne(id, userId);

    // Check if booking can be cancelled
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed booking');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        notes: reason ? `${booking.notes || ''}\nCancellation reason: ${reason}` : booking.notes,
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        calendarIntegration: true,
      },
    });

    // Handle calendar integration
    let calendarResult = null;
    try {
      if (updatedBooking.externalCalendarEventId && updatedBooking.calendarIntegration) {
        if (removeFromCalendar) {
          // Remove the event completely from the calendar
          calendarResult = await this.calendarService.removeBookingFromCalendar(id);
          console.log('Calendar event removal result:', calendarResult);
        } else {
          // Update the calendar event to show it's cancelled
          await this.updateCalendarEventAsCancelled(updatedBooking, reason);
          calendarResult = { success: true, action: 'updated_as_cancelled' };
        }
      }
    } catch (calendarError) {
      console.error('Failed to update calendar for cancelled booking:', calendarError);
      // Don't fail the cancellation if calendar update fails
      calendarResult = { success: false, error: calendarError.message };
    }

    // Send cancellation email notifications
    try {
      const cancelledBy = booking.hostId === userId ? 'host' : 'attendee';
      await this.emailService.sendBookingCancellation(updatedBooking, cancelledBy, reason);
    } catch (emailError) {
      console.error('Failed to send cancellation notification emails:', emailError);
      // Don't fail the cancellation if email fails
    }

    return {
      ...updatedBooking,
      calendarResult,
    };
  }

  private async updateCalendarEventAsCancelled(booking: any, reason?: string): Promise<void> {
    try {
      if (!booking.externalCalendarEventId || !booking.calendarIntegration) {
        return;
      }

      // Prepare the updated event data to show it's cancelled
      const cancelledTitle = `[CANCELLED] ${booking.title}`;
      const cancelledDescription = `This meeting has been cancelled.\n\n${reason ? `Reason: ${reason}\n\n` : ''}Original description:\n${booking.description || ''}`;

      // Import the calendar provider enum
      const { CalendarProvider } = await import('../calendar/dto');

      if (booking.calendarIntegration.provider === CalendarProvider.GOOGLE) {
        // Access the Google Calendar service through the calendar service
        const googleCalendarService = (this.calendarService as any).googleCalendarService;
        
        if (googleCalendarService) {
          const eventData = {
            summary: cancelledTitle,
            description: cancelledDescription,
            start: {
              dateTime: booking.startTime.toISOString(),
              timeZone: booking.timezone || 'UTC',
            },
            end: {
              dateTime: booking.endTime.toISOString(),
              timeZone: booking.timezone || 'UTC',
            },
            status: 'cancelled', // Google Calendar specific status
          };

          await googleCalendarService.updateEvent(
            booking.calendarIntegration.accessToken,
            booking.calendarIntegration.calendarId || 'primary',
            booking.externalCalendarEventId,
            eventData
          );

          console.log(`Updated Google Calendar event ${booking.externalCalendarEventId} as cancelled`);
        }
      }
    } catch (error) {
      console.error('Failed to update calendar event as cancelled:', error);
      // Don't throw the error to prevent cancellation from failing
      console.log('Continuing with booking cancellation despite calendar update failure');
    }
  }

  async reschedule(
    id: string,
    newStartTime: string,
    newEndTime: string,
    userId: string,
  ): Promise<any> {
    const booking = await this.findOne(id, userId);

    // Only host can reschedule
    if (booking.hostId !== userId) {
      throw new ForbiddenException('Only the host can reschedule bookings');
    }

    // Check if booking can be rescheduled
    if ([BookingStatus.CANCELLED, BookingStatus.COMPLETED].includes(booking.status as BookingStatus)) {
      throw new BadRequestException('Cannot reschedule cancelled or completed booking');
    }

    const oldStartTime = new Date(booking.startTime);
    const newStart = new Date(newStartTime);
    const newEnd = new Date(newEndTime);

    // Check for time conflicts (excluding current booking)
    await this.checkTimeConflicts(booking.hostId, newStart, newEnd, id);

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        startTime: newStart,
        endTime: newEnd,
        status: BookingStatus.RESCHEDULED,
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send reschedule email notifications
    try {
      const rescheduledBy = booking.hostId === userId ? 'host' : 'attendee';
      await this.emailService.sendBookingReschedule(updatedBooking, oldStartTime, rescheduledBy);
    } catch (emailError) {
      console.error('Failed to send reschedule notification emails:', emailError);
      // Don't fail the reschedule if email fails
    }

    return updatedBooking;
  }

  async getUpcomingBookings(userId: string, page: number = 1, limit: number = 10): Promise<{
    bookings: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    
    const where = {
      OR: [
        { hostId: userId },
        { attendees: { some: { userId } } },
      ],
      startTime: {
        gte: new Date(),
      },
      status: {
        in: [BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED],
      },
    };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'asc' },
        include: {
          attendees: true,
          meetingType: {
            select: {
              id: true,
              name: true,
              duration: true,
            },
          },
          host: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      bookings,
      total,
      page,
      limit,
    };
  }

  // Private helper methods
  private async checkTimeConflicts(
    hostId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ): Promise<void> {
    // Get the host's timezone
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { timezone: true }
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    const hostTimezone = host.timezone || 'Asia/Kolkata';

    console.log('DEBUG - checkTimeConflicts called with timezone handling:', {
      hostId,
      hostTimezone,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      excludeBookingId,
    });

    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        hostId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
        },
        OR: [
          {
            startTime: {
              lt: endTime,
            },
            endTime: {
              gt: startTime,
            },
          },
        ],
      },
    });

    console.log('DEBUG - Conflicting booking found:', conflictingBooking);

    if (conflictingBooking) {
      throw new ConflictException('Time slot conflicts with existing booking');
    }
  }

  private async validateTimeSlot(
    hostId: string,
    startTime: Date,
    endTime: Date,
    meetingType: any,
  ): Promise<void> {
    // Get the host's timezone from the database
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { timezone: true }
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    const hostTimezone = host.timezone || 'UTC';

    // Convert UTC times to host's timezone for availability checking
    const startTimeInHostTz = utcToZonedTime(startTime, hostTimezone);
    const endTimeInHostTz = utcToZonedTime(endTime, hostTimezone);
    
    // Get day of week in host's timezone
    const dayOfWeek = startTimeInHostTz.getDay();
    
    // Extract time components in host's timezone
    const startHours = startTimeInHostTz.getHours().toString().padStart(2, '0');
    const startMinutes = startTimeInHostTz.getMinutes().toString().padStart(2, '0');
    const endHours = endTimeInHostTz.getHours().toString().padStart(2, '0');
    const endMinutes = endTimeInHostTz.getMinutes().toString().padStart(2, '0');
    
    const timeStart = `${startHours}:${startMinutes}`;
    const timeEnd = `${endHours}:${endMinutes}`;

    console.log('DEBUG - validateTimeSlot called with timezone conversion:', {
      hostId,
      hostTimezone,
      originalStartTime: startTime.toISOString(),
      originalEndTime: endTime.toISOString(),
      startTimeInHostTz: format(startTimeInHostTz, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: hostTimezone }),
      endTimeInHostTz: format(endTimeInHostTz, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: hostTimezone }),
      dayOfWeek,
      timeStart,
      timeEnd,
    });

    const availability = await this.prisma.availability.findFirst({
      where: {
        userId: hostId,
        OR: [
          {
            type: 'RECURRING',
            dayOfWeek,
            startTime: { lte: timeStart },
            endTime: { gte: timeEnd },
            isBlocked: false,
          },
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(startTime.toDateString()),
              lt: new Date(new Date(startTime.toDateString()).getTime() + 24 * 60 * 60 * 1000),
            },
            startTime: { lte: timeStart },
            endTime: { gte: timeEnd },
            isBlocked: false,
          },
        ],
      },
    });

    console.log('DEBUG - Availability query details:', {
      userId: hostId,
      dayOfWeek,
      requestedTimeStart: timeStart,
      requestedTimeEnd: timeEnd,
      queryConditions: {
        recurringCondition: {
          type: 'RECURRING',
          dayOfWeek,
          startTime_lte: timeStart,
          endTime_gte: timeEnd,
          isBlocked: false,
        }
      }
    });

    console.log('DEBUG - Found availability:', availability);

    // Let's also check what availability records exist for this user
    const allAvailability = await this.prisma.availability.findMany({
      where: {
        userId: hostId,
      },
      select: {
        id: true,
        type: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isBlocked: true,
        specificDate: true,
      },
    });

    console.log('DEBUG - All availability records for user:', allAvailability);

    if (!availability) {
      // Check if user has any availability set up at all
      if (allAvailability.length === 0) {
        throw new BadRequestException('No availability has been configured. Please set up your availability schedule first before accepting bookings.');
      }
      
      // User has availability but not for this specific time slot
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dayOfWeek];
      throw new BadRequestException(`Selected time slot is not available. No availability is configured for ${dayName} at ${timeStart}-${timeEnd}.`);
    }

    // Check for blocked times using host timezone
    const startDateInHostTz = format(startTimeInHostTz, 'yyyy-MM-dd', { timeZone: hostTimezone });
    const startOfDayInHostTz = zonedTimeToUtc(`${startDateInHostTz} 00:00:00`, hostTimezone);
    const endOfDayInHostTz = zonedTimeToUtc(`${startDateInHostTz} 23:59:59`, hostTimezone);

    const blockedTime = await this.prisma.availability.findFirst({
      where: {
        userId: hostId,
        isBlocked: true,
        OR: [
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: startOfDayInHostTz,
              lt: endOfDayInHostTz,
            },
          },
          {
            type: 'RECURRING',
            dayOfWeek,
          },
        ],
        startTime: { lte: timeEnd },
        endTime: { gte: timeStart },
      },
    });

    if (blockedTime) {
      throw new BadRequestException('Selected time slot is blocked');
    }
  }

  private async handleStatusChange(booking: any, newStatus: BookingStatus): Promise<void> {
    // Add business logic for status changes
    switch (newStatus) {
      case BookingStatus.COMPLETED:
        if (new Date() < new Date(booking.endTime)) {
          throw new BadRequestException('Cannot mark future booking as completed');
        }
        break;
      case BookingStatus.NO_SHOW:
        if (new Date() < new Date(booking.startTime)) {
          throw new BadRequestException('Cannot mark future booking as no-show');
        }
        break;
    }
  }

  // Public booking methods for client booking pages
  async createPublicBooking(createBookingDto: CreateBookingDto): Promise<any> {
    const { attendees, ...bookingData } = createBookingDto;

    console.log('DEBUG - Public booking creation called with:', {
      createBookingDto,
      bookingData,
    });

    // Validate meeting type exists and get host info
    const meetingType = await this.prisma.meetingType.findFirst({
      where: {
        id: createBookingDto.meetingTypeId,
        isActive: true,
      },
      include: {
        host: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found or not accessible');
    }

    const hostId = meetingType.hostId;

    // Validate that the host user is active and available for bookings
    const hostUser = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { 
        id: true, 
        isActive: true, 
        firstName: true, 
        lastName: true 
      },
    });

    if (!hostUser) {
      throw new NotFoundException('Host user not found');
    }

    if (!hostUser.isActive) {
      throw new BadRequestException('This user is currently not accepting bookings. Please try again later.');
    }

    // Validate end time based on meeting duration
    const startTime = new Date(createBookingDto.startTime);
    const providedEndTime = new Date(createBookingDto.endTime);
    const expectedEndTime = new Date(startTime.getTime() + meetingType.duration * 60000);

    // Allow some tolerance (1 minute) for timing differences
    const timeDifference = Math.abs(providedEndTime.getTime() - expectedEndTime.getTime());
    const toleranceMs = 60000; // 1 minute

    let finalEndTime = providedEndTime;
    if (timeDifference > toleranceMs) {
      console.log('DEBUG - Correcting end time:', {
        providedEndTime: providedEndTime.toISOString(),
        expectedEndTime: expectedEndTime.toISOString(),
        timeDifference,
        tolerance: toleranceMs,
      });
      finalEndTime = expectedEndTime;
    }

    // Check for time conflicts with existing bookings
    await this.checkTimeConflicts(hostId, startTime, finalEndTime);

    // Validate time slot availability
    await this.validateTimeSlot(hostId, startTime, finalEndTime, meetingType);

    try {
      const booking = await this.prisma.booking.create({
        data: {
          ...bookingData,
          startTime: startTime,
          endTime: finalEndTime,
          hostId,
          // Set status based on whether approval is required
          status: meetingType.requiresApproval ? BookingStatus.PENDING : BookingStatus.CONFIRMED,
          // Use the provided meeting provider or fall back to the meeting type's default
          meetingProvider: createBookingDto.meetingProvider || meetingType.meetingProvider,
          attendees: {
            create: attendees.map((attendee) => ({
              ...attendee,
              status: meetingType.requiresApproval ? 'PENDING' : 'CONFIRMED',
            })),
          },
        },
        include: {
          attendees: true,
          meetingType: true,
          host: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Send email notifications based on approval status
      try {
        if (meetingType.requiresApproval) {
          // For pending bookings, send different notifications
          await Promise.all([
            this.emailService.sendBookingPendingConfirmation(booking),
            this.emailService.sendBookingApprovalRequest(booking),
          ]);
        } else {
          // For auto-confirmed bookings, send regular confirmations
          await Promise.all([
            this.emailService.sendBookingConfirmation(booking),
            this.emailService.sendBookingNotificationToHost(booking),
          ]);
        }
      } catch (emailError) {
        console.error('Failed to send booking notification emails:', emailError);
        // Don't fail the booking creation if email fails
      }

      return booking;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Booking conflict detected');
      }
      throw error;
    }
  }

  async getAvailableSlots(hostId: string, date: string, duration: number, timezone?: string): Promise<any> {
    try {
      // Input validation
      if (!hostId || !date || !duration) {
        throw new BadRequestException('Missing required parameters: hostId, date, or duration');
      }

      if (duration < 15 || duration > 480) {
        throw new BadRequestException('Duration must be between 15 minutes and 8 hours');
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
      }

      const requestedDate = new Date(date);
      if (isNaN(requestedDate.getTime())) {
        throw new BadRequestException('Invalid date provided');
      }

      // Check if date is in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (requestedDate < today) {
        return {
          availableSlots: [],
          unavailableSlots: [],
          allSlots: [],
          message: 'Cannot book appointments for past dates',
          reason: 'PAST_DATE'
        };
      }

      // First validate that the host user is active and get their timezone
      const hostUser = await this.prisma.user.findUnique({
        where: { id: hostId },
        select: { 
          id: true, 
          isActive: true, 
          firstName: true, 
          lastName: true,
          timezone: true
        },
      });

      if (!hostUser) {
        return { 
          availableSlots: [],
          unavailableSlots: [],
          allSlots: [],
          message: 'Host user not found.',
          reason: 'HOST_NOT_FOUND'
        };
      }

      if (!hostUser.isActive) {
        return { 
          availableSlots: [],
          unavailableSlots: [],
          allSlots: [],
          message: 'This user is currently not accepting bookings. Please try again later.',
          reason: 'HOST_INACTIVE'
        };
      }

      const hostTimezone = hostUser.timezone || 'UTC';
      const requestTimezone = timezone || hostTimezone;
      
      console.log('DEBUG - Getting available slots with enhanced error handling:', {
        hostId,
        date,
        duration,
        hostTimezone,
        requestTimezone,
        hostName: `${hostUser.firstName} ${hostUser.lastName}`
      });

      // Convert the requested date to get day of week
      const dateObj = new Date(date + 'T12:00:00'); // Use noon to avoid timezone edge cases
      const dayOfWeek = dateObj.getDay(); // Get day of week from the date directly
      
      console.log('DEBUG - Date analysis:', {
        requestedDate: date,
        dateObj: dateObj.toISOString(),
        dayOfWeek,
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]
      });

    // Get host availability for the day with optimized query
    const availability = await this.prisma.availability.findMany({
      where: {
        userId: hostId,
        OR: [
          {
            type: 'RECURRING',
            dayOfWeek,
            isBlocked: false,
          },
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(date + 'T00:00:00.000Z'),
              lt: new Date(date + 'T23:59:59.999Z'),
            },
            isBlocked: false,
          },
        ],
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        type: true,
        dayOfWeek: true,
        specificDate: true
      },
      orderBy: { startTime: 'asc' }
    });

    console.log('DEBUG - Found availability records:', availability.length);

    if (!availability.length) {
      // Check if user has any availability configured at all
      const totalAvailability = await this.prisma.availability.count({
        where: { userId: hostId }
      });

      console.log('DEBUG - Total availability count for user:', totalAvailability);
      
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dayOfWeek];
      
      if (totalAvailability === 0) {
        return { 
          availableSlots: [],
          unavailableSlots: [],
          allSlots: [],
          message: 'No availability has been configured. Please set up your availability schedule first.',
          reason: 'NO_AVAILABILITY_CONFIGURED'
        };
      } else {
        return { 
          availableSlots: [],
          unavailableSlots: [],
          allSlots: [],
          message: `No availability is configured for ${dayName}. Please check your availability settings.`,
          reason: 'NO_AVAILABILITY_FOR_DAY'
        };
      }
    }

    // Get existing bookings for the day with optimized query
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        startTime: {
          gte: new Date(date + 'T00:00:00.000Z'),
          lt: new Date(date + 'T23:59:59.999Z'),
        },
        status: {
          in: ['CONFIRMED', 'PENDING'],
        },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true
      },
      orderBy: { startTime: 'asc' }
    });

    console.log('DEBUG - Found existing bookings:', existingBookings.length);

    // Generate available and unavailable slots with improved timezone handling
    const availableSlots = [];
    const unavailableSlots = [];
    const slotDuration = duration || 30; // default 30 minutes
    const slotInterval = 15; // 15-minute intervals for slot generation
    
    for (const avail of availability) {
      const [startHour, startMinute] = avail.startTime.split(':').map(Number);
      const [endHour, endMinute] = avail.endTime.split(':').map(Number);
      
      // Create availability window for the requested date in host timezone (IST)
      // The availability times are stored in IST, so we need to create them properly
      const dateStr = date; // YYYY-MM-DD format
      
      // Create IST times by constructing ISO strings with IST offset
      const istStartTime = `${dateStr}T${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}:00+05:30`;
      const istEndTime = `${dateStr}T${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00+05:30`;
      
      const availStart = new Date(istStartTime);
      const availEnd = new Date(istEndTime);
      
      console.log(`DEBUG - Availability window (IST): ${istStartTime} to ${istEndTime}`);
      console.log(`DEBUG - Availability window (UTC): ${availStart.toISOString()} to ${availEnd.toISOString()}`);
      
      // Generate slots at 15-minute intervals
      let currentSlot = new Date(availStart);
      
      while (currentSlot.getTime() + slotDuration * 60000 <= availEnd.getTime()) {
        const slotEnd = new Date(currentSlot.getTime() + slotDuration * 60000);
        
        // Check if slot conflicts with existing bookings
        const hasConflict = existingBookings.some(booking => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          
          return (
            (currentSlot >= bookingStart && currentSlot < bookingEnd) ||
            (slotEnd > bookingStart && slotEnd <= bookingEnd) ||
            (currentSlot <= bookingStart && slotEnd >= bookingEnd)
          );
        });
        
        // Generate properly formatted label for the user's timezone
        let formattedLabel: string;
        
        if (timezone && timezone !== 'UTC') {
          // Convert to user's timezone
          formattedLabel = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true,
            timeZone: timezone
          }).format(currentSlot);
          
          // Check if the time appears on a different date in user's timezone
          const hostDate = new Intl.DateTimeFormat('en-CA').format(currentSlot);
          const userDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone
          }).format(currentSlot);
          
          if (hostDate !== userDate) {
            const dateLabel = new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: timezone
            }).format(currentSlot);
            formattedLabel = `${formattedLabel} (${dateLabel})`;
          }
        } else {
          // Default to host timezone (IST) if no timezone specified
          formattedLabel = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
          }).format(currentSlot);
        }
        
        const slotData = {
          startTime: currentSlot.toISOString(),
          endTime: slotEnd.toISOString(),
          label: formattedLabel,
          available: !hasConflict,
          reason: hasConflict ? 'BOOKED' : null
        };
        
        if (!hasConflict) {
          availableSlots.push(slotData);
        } else {
          unavailableSlots.push(slotData);
        }
        
        // Move to next slot (15-minute intervals)
        currentSlot = new Date(currentSlot.getTime() + slotInterval * 60000);
      }
    }

    console.log(`DEBUG - Generated ${availableSlots.length} available slots and ${unavailableSlots.length} unavailable slots`);

    // If no available slots, provide suggestions for alternative dates
    let suggestions = [];
    if (availableSlots.length === 0) {
      suggestions = await this.getAlternativeDateSuggestions(hostId, date, duration, timezone);
    }

    return { 
      availableSlots: availableSlots,
      unavailableSlots: unavailableSlots,
      allSlots: [...availableSlots, ...unavailableSlots].sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ),
      suggestions: suggestions,
      meta: {
        requestedDate: date,
        timezone: timezone || 'UTC',
        duration: duration,
        totalSlotsGenerated: availableSlots.length + unavailableSlots.length
      }
    };
    } catch (error) {
      console.error('Error getting available slots:', error);
      throw new BadRequestException('Failed to retrieve available slots. Please try again.');
    }
  }

  /**
   * Get alternative date suggestions when no slots are available for the requested date
   */
  private async getAlternativeDateSuggestions(hostId: string, requestedDate: string, duration: number, timezone?: string) {
    const suggestions = [];
    const startDate = new Date(requestedDate);
    
    // Check next 7 days for alternative slots
    for (let i = 1; i <= 7; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + i);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      try {
        const result = await this.getAvailableSlots(hostId, dateStr, duration, timezone);
        if (result.availableSlots && result.availableSlots.length > 0) {
          suggestions.push({
            date: dateStr,
            availableCount: result.availableSlots.length,
            firstAvailableSlot: result.availableSlots[0],
            dayName: checkDate.toLocaleDateString('en-US', { weekday: 'long' })
          });
          
          // Stop after finding 3 alternative dates
          if (suggestions.length >= 3) break;
        }
      } catch (error) {
        // Continue checking other dates if one fails
        continue;
      }
    }
    
    return suggestions;
  }

  async getAvailableSlotsForMeetingType(meetingTypeId: string, date: string, timezone?: string): Promise<any> {
    console.log('DEBUG - Getting available slots for meeting type:', {
      meetingTypeId,
      date,
      timezone,
    });

    // First, get the meeting type to get host and duration info
    const meetingType = await this.prisma.meetingType.findUnique({
      where: { id: meetingTypeId },
      select: {
        id: true,
        hostId: true,
        duration: true,
        isActive: true,
      },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found');
    }

    if (!meetingType.isActive) {
      throw new BadRequestException('Meeting type is not active');
    }

    // Use the existing getAvailableSlots method with the host ID and duration
    return this.getAvailableSlots(meetingType.hostId, date, meetingType.duration, timezone);
  }

  async getMeetingProvidersForMeetingType(meetingTypeId: string) {
    // Get the meeting type with its organization
    const meetingType = await this.prisma.meetingType.findUnique({
      where: { id: meetingTypeId },
      include: {
        organization: {
          select: {
            id: true,
            supportedMeetingProviders: true,
            defaultMeetingProvider: true,
          },
        },
      },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found');
    }

    if (!meetingType.isActive) {
      throw new BadRequestException('Meeting type is not active');
    }

    return {
      meetingTypeId: meetingType.id,
      currentProvider: meetingType.meetingProvider,
      availableProviders: meetingType.organization.supportedMeetingProviders,
      defaultProvider: meetingType.organization.defaultMeetingProvider,
    };
  }

  // Public booking action methods (with token verification)
  private generateBookingToken(bookingId: string): string {
    // In production, this should be a secure JWT token with expiration
    return Buffer.from(`${bookingId}:${Date.now()}`).toString('base64');
  }

  private verifyBookingToken(bookingId: string, token: string): boolean {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [id, timestamp] = decoded.split(':');
      
      // Verify booking ID matches
      if (id !== bookingId) {
        return false;
      }
      
      // Token expires after 24 hours
      const tokenAge = Date.now() - parseInt(timestamp);
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      return tokenAge < maxAge;
    } catch {
      return false;
    }
  }

  async getBookingForPublicAction(bookingId: string, token: string): Promise<any> {
    if (!this.verifyBookingToken(bookingId, token)) {
      throw new BadRequestException('Invalid or expired token');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  async rescheduleBookingPublic(
    bookingId: string,
    token: string,
    newStartTime: string,
    newEndTime: string,
  ): Promise<any> {
    if (!this.verifyBookingToken(bookingId, token)) {
      throw new BadRequestException('Invalid or expired token');
    }

    const booking = await this.getBookingForPublicAction(bookingId, token);

    // Check if booking can be rescheduled
    if ([BookingStatus.CANCELLED, BookingStatus.COMPLETED].includes(booking.status as BookingStatus)) {
      throw new BadRequestException('Cannot reschedule cancelled or completed booking');
    }

    const oldStartTime = new Date(booking.startTime);
    const newStart = new Date(newStartTime);
    const newEnd = new Date(newEndTime);

    // Check for time conflicts (excluding current booking)
    await this.checkTimeConflicts(booking.hostId, newStart, newEnd, bookingId);

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        startTime: newStart,
        endTime: newEnd,
        status: BookingStatus.RESCHEDULED,
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send reschedule email notifications
    try {
      await this.emailService.sendBookingReschedule(updatedBooking, oldStartTime, 'attendee');
    } catch (emailError) {
      console.error('Failed to send reschedule notification emails:', emailError);
      // Don't fail the reschedule if email fails
    }

    return updatedBooking;
  }

  // Booking approval methods
  async approveBooking(bookingId: string, hostId: string): Promise<any> {
    // Verify the booking exists and belongs to the host
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        hostId: hostId,
        status: BookingStatus.PENDING,
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Pending booking not found or access denied');
    }

    // Check for conflicts before approving
    await this.checkTimeConflicts(
      booking.hostId,
      new Date(booking.startTime),
      new Date(booking.endTime),
      booking.id
    );

    // Update booking status to confirmed
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        attendees: {
          updateMany: {
            where: { bookingId },
            data: { status: 'CONFIRMED' }
          }
        }
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Generate meeting link if needed
    let meetingUrl = null;
    try {
      meetingUrl = await this.generateMeetingLink(updatedBooking);
      if (meetingUrl) {
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { meetingUrl }
        });
        updatedBooking.meetingUrl = meetingUrl;
      }
    } catch (meetingError) {
      console.error('Failed to generate meeting link:', meetingError);
      // Don't fail the approval if meeting link generation fails
    }

    // Fetch the updated booking with the meeting URL to ensure email has the latest data
    const finalBooking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Add to calendar after approval
    let calendarResult = null;
    try {
      calendarResult = await this.calendarService.syncBookingToCalendar(finalBooking.id);
      console.log('Calendar integration result:', calendarResult);
    } catch (calendarError) {
      console.error('Failed to add approved booking to calendar:', calendarError);
      // Don't fail the approval if calendar integration fails
      calendarResult = { success: false, error: calendarError.message };
    }

    // Send confirmation emails
    try {
      await Promise.all([
        this.emailService.sendBookingApprovalConfirmation(finalBooking, meetingUrl),
        this.emailService.sendBookingConfirmedNotificationToHost(finalBooking),
      ]);
    } catch (emailError) {
      console.error('Failed to send approval confirmation emails:', emailError);
      // Don't fail the approval if email fails
    }

    return {
      ...updatedBooking,
      calendarResult,
    };
  }

  async declineBooking(bookingId: string, hostId: string, reason?: string): Promise<any> {
    // Verify the booking exists and belongs to the host
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        hostId: hostId,
        status: BookingStatus.PENDING,
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Pending booking not found or access denied');
    }

    // Update booking status to cancelled
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        notes: reason ? `${booking.notes || ''}\nDecline reason: ${reason}` : booking.notes,
        attendees: {
          updateMany: {
            where: { bookingId },
            data: { status: 'CANCELLED' }
          }
        }
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send decline notification
    try {
      await this.emailService.sendBookingDeclineNotification(updatedBooking, reason);
    } catch (emailError) {
      console.error('Failed to send decline notification emails:', emailError);
      // Don't fail the decline if email fails
    }

    return updatedBooking;
  }

  async getPendingBookings(hostId: string, page: number = 1, limit: number = 10): Promise<{
    bookings: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    
    const where = {
      hostId,
      status: BookingStatus.PENDING,
    };

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          attendees: true,
          meetingType: {
            select: {
              id: true,
              name: true,
              duration: true,
            },
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      bookings,
      total,
      page,
      limit,
    };
  }

  // Meeting link generation helper
  private async generateMeetingLink(booking: any): Promise<string | null> {
    const provider = booking.meetingProvider || booking.meetingType.meetingProvider;
    
    switch (provider) {
      case 'GOOGLE_MEET':
        return await this.generateGoogleMeetLink(booking);
      case 'MICROSOFT_TEAMS':
        return await this.generateTeamsLink(booking);
      case 'ZOOM':
        return await this.generateZoomLink(booking);
      default:
        return null;
    }
  }

  private async generateGoogleMeetLink(booking: any): Promise<string | null> {
    // Generate a unique Google Meet link with proper format
    // Google Meet IDs follow the pattern: xxx-yyyy-zzz (3 groups of 3-4 characters)
    const generateRandomString = (length: number): string => {
      const chars = 'abcdefghijklmnopqrstuvwxyz';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    
    const part1 = generateRandomString(3);
    const part2 = generateRandomString(4);
    const part3 = generateRandomString(3);
    const meetId = `${part1}-${part2}-${part3}`;
    
    return `https://meet.google.com/${meetId}`;
  }

  private async generateTeamsLink(booking: any): Promise<string | null> {
    // Generate a Teams meeting link
    // This would typically integrate with Microsoft Graph API
    const meetId = `${booking.id.substring(0, 8)}-${Date.now().toString(36)}`;
    return `https://teams.microsoft.com/l/meetup-join/${meetId}`;
  }

  private async generateZoomLink(booking: any): Promise<string | null> {
    // Generate a Zoom meeting link
    // This would typically integrate with Zoom API
    const meetId = `${booking.id.substring(0, 8)}-${Date.now().toString(36)}`;
    return `https://zoom.us/j/${meetId}`;
  }

  async cancelBookingPublic(bookingId: string, token: string, reason?: string, removeFromCalendar?: boolean): Promise<any> {
    if (!this.verifyBookingToken(bookingId, token)) {
      throw new BadRequestException('Invalid or expired token');
    }

    const booking = await this.getBookingForPublicAction(bookingId, token);

    // Check if booking can be cancelled
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed booking');
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        notes: reason ? `${booking.notes || ''}\nCancellation reason: ${reason}` : booking.notes,
      },
      include: {
        attendees: true,
        meetingType: true,
        host: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        calendarIntegration: true,
      },
    });

    // Handle calendar integration
    let calendarResult = null;
    try {
      if (updatedBooking.externalCalendarEventId && updatedBooking.calendarIntegration) {
        if (removeFromCalendar) {
          // Remove the event completely from the calendar
          calendarResult = await this.calendarService.removeBookingFromCalendar(bookingId);
          console.log('Calendar event removal result:', calendarResult);
        } else {
          // Update the calendar event to show it's cancelled
          await this.updateCalendarEventAsCancelled(updatedBooking, reason);
          calendarResult = { success: true, action: 'updated_as_cancelled' };
        }
      }
    } catch (calendarError) {
      console.error('Failed to update calendar for cancelled booking:', calendarError);
      // Don't fail the cancellation if calendar update fails
      calendarResult = { success: false, error: calendarError.message };
    }

    // Send cancellation email notifications
    try {
      await this.emailService.sendBookingCancellation(updatedBooking, 'attendee', reason);
    } catch (emailError) {
      console.error('Failed to send cancellation notification emails:', emailError);
      // Don't fail the cancellation if email fails
    }

    return {
      ...updatedBooking,
      calendarResult,
    };
  }
}
