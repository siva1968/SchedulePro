import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
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

    // Check for time conflicts
    try {
      await this.checkTimeConflicts(
        hostId,
        new Date(createBookingDto.startTime),
        new Date(createBookingDto.endTime),
      );
      console.log('DEBUG - Time conflict check passed, proceeding...');
    } catch (error) {
      console.log('DEBUG - Time conflict detected:', error.message);
      throw error;
    }

    // Validate time slot availability
    await this.validateTimeSlot(
      hostId,
      new Date(createBookingDto.startTime),
      new Date(createBookingDto.endTime),
      meetingType,
    );

    try {
      const booking = await this.prisma.booking.create({
        data: {
          ...bookingData,
          startTime: new Date(createBookingDto.startTime),
          endTime: new Date(createBookingDto.endTime),
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
        orderBy: { startTime: 'desc' },
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

  async cancel(id: string, userId: string, reason?: string): Promise<any> {
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
      },
    });

    // Send cancellation email notifications
    try {
      const cancelledBy = booking.hostId === userId ? 'host' : 'attendee';
      await this.emailService.sendBookingCancellation(updatedBooking, cancelledBy, reason);
    } catch (emailError) {
      console.error('Failed to send cancellation notification emails:', emailError);
      // Don't fail the cancellation if email fails
    }

    return updatedBooking;
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
    console.log('DEBUG - checkTimeConflicts called with:', {
      hostId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      excludeBookingId,
    });

    const conflictingBooking = await this.prisma.booking.findFirst({
      where: {
        hostId,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.RESCHEDULED],
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
        message: 'Host user not found.',
        reason: 'HOST_NOT_FOUND'
      };
    }

    if (!hostUser.isActive) {
      return { 
        availableSlots: [],
        message: 'This user is currently not accepting bookings. Please try again later.',
        reason: 'HOST_INACTIVE'
      };
    }

    const hostTimezone = hostUser.timezone || 'UTC';
    const requestTimezone = timezone || hostTimezone;

    // Convert the requested date to the host's timezone for availability checking
    const selectedDateInHostTz = zonedTimeToUtc(`${date} 00:00:00`, hostTimezone);
    const dayOfWeek = utcToZonedTime(selectedDateInHostTz, hostTimezone).getDay();
    
    console.log('DEBUG - Getting available slots with timezone support:', {
      hostId,
      date,
      duration,
      hostTimezone,
      requestTimezone,
      selectedDateInHostTz: selectedDateInHostTz.toISOString(),
      dayOfWeek,
    });

    // Get host availability for the day
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
              gte: selectedDateInHostTz,
              lt: new Date(selectedDateInHostTz.getTime() + 24 * 60 * 60 * 1000),
            },
            isBlocked: false,
          },
        ],
      },
    });

    console.log('DEBUG - Found availability records:', availability);

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
          message: 'No availability has been configured. Please set up your availability schedule first.',
          reason: 'NO_AVAILABILITY_CONFIGURED'
        };
      } else {
        return { 
          availableSlots: [],
          message: `No availability is configured for ${dayName}. Please check your availability settings.`,
          reason: 'NO_AVAILABILITY_FOR_DAY'
        };
      }
    }

    // Get existing bookings for the day
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        hostId,
        startTime: {
          gte: selectedDateInHostTz,
          lt: new Date(selectedDateInHostTz.getTime() + 24 * 60 * 60 * 1000),
        },
        status: {
          in: ['CONFIRMED', 'PENDING'],
        },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    // Generate available slots
    const slots = [];
    const slotDuration = duration || 30; // default 30 minutes
    
    for (const avail of availability) {
      const [startHour, startMinute] = avail.startTime.split(':').map(Number);
      const [endHour, endMinute] = avail.endTime.split(':').map(Number);
      
      // Create the availability times in Asia/Calcutta timezone (IST)
      // The availability is configured for IST, so 9 AM means 9 AM IST
      const dateStr = selectedDateInHostTz.toISOString().split('T')[0]; // Get YYYY-MM-DD
      
      // If user is in a different timezone, we need to calculate what date in IST 
      // corresponds to their selected date
      let istDateStr = dateStr;
      
      if (timezone && timezone !== 'Asia/Calcutta' && timezone !== 'Asia/Kolkata') {
        // Calculate what IST date would show the slots on the user's selected date
        // For example: if user selects Sept 3 in PST, we want IST slots that appear on Sept 3 PST
        const userSelectedDate = new Date(`${dateStr}T12:00:00`); // noon on selected date
        
        // Convert user's noon to IST to see what IST date we should use
        const userNoonInIST = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Calcutta',
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit'
        }).format(userSelectedDate);
        
        istDateStr = userNoonInIST;
        console.log(`DEBUG - User selected ${dateStr} in ${timezone}, using IST date ${istDateStr} for availability lookup`);
      }
      
      // Create time strings in IST using the calculated IST date
      const istStartTime = `${istDateStr}T${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}:00+05:30`;
      const istEndTime = `${istDateStr}T${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00+05:30`;
      
      const availStart = new Date(istStartTime);
      const availEnd = new Date(istEndTime);
      
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
        
        if (!hasConflict) {
          // The currentSlot is already in IST (9 AM IST for example)
          // We need to convert this IST time to the requested timezone
          let formattedLabel: string;
          
          if (timezone) {
            // Use Intl.DateTimeFormat to convert from IST to the target timezone
            const timeLabel = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true,
              timeZone: timezone
            }).format(currentSlot);
            
            // Check if the converted time is on a different date
            const istDate = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Calcutta'
            }).format(currentSlot); // YYYY-MM-DD format
            
            const convertedDate = new Intl.DateTimeFormat('en-CA', {
              timeZone: timezone
            }).format(currentSlot); // YYYY-MM-DD format
            
            if (istDate !== convertedDate) {
              // Different dates - show both date and time
              const dateLabel = new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: timezone
              }).format(currentSlot);
              formattedLabel = `${timeLabel} (${dateLabel})`;
            } else {
              // Same date - just show time
              formattedLabel = timeLabel;
            }
            
            console.log(`DEBUG - Converting IST time ${currentSlot.toISOString()} to ${timezone}: ${formattedLabel}`);
          } else {
            // No timezone specified, show as IST
            formattedLabel = new Intl.DateTimeFormat('en-US', {
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true,
              timeZone: 'Asia/Calcutta'
            }).format(currentSlot);
            console.log('DEBUG - No timezone: showing as IST:', formattedLabel);
          }
          
          slots.push({
            startTime: currentSlot.toISOString(),
            endTime: slotEnd.toISOString(),
            label: formattedLabel,
          });
        }
        
        // Move to next slot (15-minute intervals)
        currentSlot = new Date(currentSlot.getTime() + 15 * 60000);
      }
    }

    return { availableSlots: slots };
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

    return updatedBooking;
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
    // Generate a unique Google Meet link
    // This is a simple implementation - you might want to integrate with Google Calendar API
    const meetId = `${booking.id.substring(0, 8)}-${Date.now().toString(36)}`;
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

  async cancelBookingPublic(bookingId: string, token: string, reason?: string): Promise<any> {
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
      },
    });

    // Send cancellation email notifications
    try {
      await this.emailService.sendBookingCancellation(updatedBooking, 'attendee', reason);
    } catch (emailError) {
      console.error('Failed to send cancellation notification emails:', emailError);
      // Don't fail the cancellation if email fails
    }

    return updatedBooking;
  }
}
