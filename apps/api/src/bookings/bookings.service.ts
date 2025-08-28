import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateBookingDto, UpdateBookingDto, BookingQueryDto } from './dto';

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
  constructor(private readonly prisma: PrismaService) {}

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
      return await this.prisma.booking.create({
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

    return await this.prisma.booking.update({
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

    const newStart = new Date(newStartTime);
    const newEnd = new Date(newEndTime);

    // Check for time conflicts (excluding current booking)
    await this.checkTimeConflicts(booking.hostId, newStart, newEnd, id);

    return await this.prisma.booking.update({
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
  }

  async getUpcomingBookings(userId: string, limit: number = 10): Promise<any[]> {
    return await this.prisma.booking.findMany({
      where: {
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
      },
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
    });
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
    // Check if the time slot falls within host's availability
    const dayOfWeek = startTime.getDay();
    
    // Extract time from the original startTime and endTime to avoid timezone issues
    // Create local time strings by manually parsing the Date components
    const startHours = startTime.getHours().toString().padStart(2, '0');
    const startMinutes = startTime.getMinutes().toString().padStart(2, '0');
    const endHours = endTime.getHours().toString().padStart(2, '0');
    const endMinutes = endTime.getMinutes().toString().padStart(2, '0');
    
    const timeStart = `${startHours}:${startMinutes}`;
    const timeEnd = `${endHours}:${endMinutes}`;

    console.log('DEBUG - validateTimeSlot called with:', {
      hostId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      dayOfWeek,
      timeStart,
      timeEnd,
      originalTimeString: startTime.toTimeString(),
      extractedHours: { startHours, startMinutes, endHours, endMinutes }
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

    // Check for blocked times
    const blockedTime = await this.prisma.availability.findFirst({
      where: {
        userId: hostId,
        isBlocked: true,
        OR: [
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(startTime.toDateString()),
              lt: new Date(new Date(startTime.toDateString()).getTime() + 24 * 60 * 60 * 1000),
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
      return await this.prisma.booking.create({
        data: {
          ...bookingData,
          startTime: startTime,
          endTime: finalEndTime,
          hostId,
          status: BookingStatus.CONFIRMED,
          // Use the provided meeting provider or fall back to the meeting type's default
          meetingProvider: createBookingDto.meetingProvider || meetingType.meetingProvider,
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
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Booking conflict detected');
      }
      throw error;
    }
  }

  async getAvailableSlots(hostId: string, date: string, duration: number): Promise<any> {
    // First validate that the host user is active
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

    const selectedDate = new Date(date);
    const dayOfWeek = selectedDate.getDay();
    
    console.log('DEBUG - Getting available slots for:', {
      hostId,
      date,
      duration,
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
              gte: new Date(selectedDate.toDateString()),
              lt: new Date(new Date(selectedDate.toDateString()).getTime() + 24 * 60 * 60 * 1000),
            },
            isBlocked: false,
          },
        ],
      },
    });

    if (!availability.length) {
      // Check if user has any availability configured at all
      const totalAvailability = await this.prisma.availability.count({
        where: { userId: hostId }
      });
      
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
          gte: new Date(selectedDate.toDateString()),
          lt: new Date(new Date(selectedDate.toDateString()).getTime() + 24 * 60 * 60 * 1000),
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
      
      const availStart = new Date(selectedDate);
      availStart.setHours(startHour, startMinute, 0, 0);
      
      const availEnd = new Date(selectedDate);
      availEnd.setHours(endHour, endMinute, 0, 0);
      
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
          slots.push({
            startTime: currentSlot.toISOString(),
            endTime: slotEnd.toISOString(),
            label: currentSlot.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            }),
          });
        }
        
        // Move to next slot (15-minute intervals)
        currentSlot = new Date(currentSlot.getTime() + 15 * 60000);
      }
    }

    return { availableSlots: slots };
  }

  async getAvailableSlotsForMeetingType(meetingTypeId: string, date: string): Promise<any> {
    console.log('DEBUG - Getting available slots for meeting type:', {
      meetingTypeId,
      date,
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
    return this.getAvailableSlots(meetingType.hostId, date, meetingType.duration);
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
}
