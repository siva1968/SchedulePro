import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAvailabilityDto, UpdateAvailabilityDto, AvailabilityQueryDto } from './dto';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAvailabilityDto: CreateAvailabilityDto, userId: string) {
    await this.validateAvailability(createAvailabilityDto, userId);

    const createData = {
      ...createAvailabilityDto,
      specificDate: createAvailabilityDto.specificDate 
        ? new Date(createAvailabilityDto.specificDate) 
        : null,
      userId,
    };

    return await this.prisma.availability.create({
      data: createData,
    });
  }

  async findAll(query: AvailabilityQueryDto, userId: string) {
    const where: any = { userId };

    if (query.type) {
      where.type = query.type;
    }

    if (query.dayOfWeek !== undefined) {
      where.dayOfWeek = query.dayOfWeek;
    }

    if (query.isBlocked !== undefined) {
      where.isBlocked = query.isBlocked;
    }

    if (query.startDate || query.endDate) {
      where.specificDate = {};
      if (query.startDate) {
        where.specificDate.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.specificDate.lte = new Date(query.endDate);
      }
    }

    return await this.prisma.availability.findMany({
      where,
      orderBy: [
        { type: 'asc' },
        { dayOfWeek: 'asc' },
        { specificDate: 'asc' },
        { startTime: 'asc' },
      ],
    });
  }

  async findOne(id: string, userId: string) {
    const availability = await this.prisma.availability.findFirst({
      where: { id, userId },
    });

    if (!availability) {
      throw new NotFoundException('Availability slot not found');
    }

    return availability;
  }

  async update(id: string, updateAvailabilityDto: UpdateAvailabilityDto, userId: string) {
    await this.findOne(id, userId); // Verify ownership

    await this.validateAvailability(updateAvailabilityDto, userId, id);

    return await this.prisma.availability.update({
      where: { id },
      data: {
        ...updateAvailabilityDto,
        specificDate: updateAvailabilityDto.specificDate 
          ? new Date(updateAvailabilityDto.specificDate) 
          : undefined,
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId); // Verify ownership

    return await this.prisma.availability.delete({
      where: { id },
    });
  }

  async getAvailableSlots(
    userId: string,
    date: string,
    duration: number, // in minutes
    bufferTime: number = 0, // buffer between meetings in minutes
  ) {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    // Get all availability for the date
    const availabilities = await this.prisma.availability.findMany({
      where: {
        userId,
        OR: [
          {
            type: 'RECURRING',
            dayOfWeek,
            isBlocked: false,
          },
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(targetDate.toDateString()),
              lt: new Date(new Date(targetDate.toDateString()).getTime() + 24 * 60 * 60 * 1000),
            },
            isBlocked: false,
          },
        ],
      },
      orderBy: { startTime: 'asc' },
    });

    // If no availability found, check if user has any availability at all
    if (availabilities.length === 0) {
      const totalAvailability = await this.prisma.availability.count({
        where: { userId }
      });
      
      if (totalAvailability === 0) {
        throw new BadRequestException('No availability has been configured. Please set up your availability schedule first before accepting bookings.');
      }
    }

    // Get blocked times for the date
    const blockedTimes = await this.prisma.availability.findMany({
      where: {
        userId,
        isBlocked: true,
        OR: [
          {
            type: 'RECURRING',
            dayOfWeek,
          },
          {
            type: 'DATE_SPECIFIC',
            specificDate: {
              gte: new Date(targetDate.toDateString()),
              lt: new Date(new Date(targetDate.toDateString()).getTime() + 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
    });

    // Get existing bookings for the date
    const existingBookings = await this.prisma.booking.findMany({
      where: {
        hostId: userId,
        startTime: {
          gte: new Date(targetDate.toDateString()),
          lt: new Date(new Date(targetDate.toDateString()).getTime() + 24 * 60 * 60 * 1000),
        },
        status: {
          in: ['CONFIRMED', 'RESCHEDULED'],
        },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    // Generate available time slots
    const slots = [];
    
    for (const availability of availabilities) {
      const availableSlots = this.generateTimeSlots(
        availability.startTime,
        availability.endTime,
        duration,
        bufferTime,
        targetDate,
      );

      // Filter out blocked and booked slots
      const filteredSlots = availableSlots.filter(slot => {
        const slotStart = new Date(slot.startTime);
        const slotEnd = new Date(slot.endTime);

        // Check against blocked times
        const isBlocked = blockedTimes.some(blocked => {
          const blockedStart = this.combineDateTime(targetDate, blocked.startTime);
          const blockedEnd = this.combineDateTime(targetDate, blocked.endTime);
          return this.timeSlotOverlaps(slotStart, slotEnd, blockedStart, blockedEnd);
        });

        // Check against existing bookings
        const isBooked = existingBookings.some(booking => {
          return this.timeSlotOverlaps(slotStart, slotEnd, booking.startTime, booking.endTime);
        });

        return !isBlocked && !isBooked;
      });

      slots.push(...filteredSlots);
    }

    // Remove duplicates and sort
    const uniqueSlots = slots.filter((slot, index, self) => 
      index === self.findIndex(s => s.startTime === slot.startTime)
    );

    return uniqueSlots.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  async bulkCreateWeeklyAvailability(
    userId: string,
    weeklySchedule: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }>,
  ) {
    // Remove existing recurring availability
    await this.prisma.availability.deleteMany({
      where: {
        userId,
        type: 'RECURRING',
        isBlocked: false,
      },
    });

    // Create new weekly schedule
    const availabilities = weeklySchedule.map(schedule => ({
      ...schedule,
      userId,
      type: 'RECURRING' as const,
      isBlocked: false,
    }));

    return await this.prisma.availability.createMany({
      data: availabilities,
    });
  }

  // Private helper methods
  private async validateAvailability(
    availabilityData: CreateAvailabilityDto | UpdateAvailabilityDto,
    userId: string,
    excludeId?: string,
  ) {
    // Validate time format and logic
    if (availabilityData.startTime && availabilityData.endTime) {
      if (availabilityData.startTime >= availabilityData.endTime) {
        throw new BadRequestException('Start time must be before end time');
      }
    }

    // Validate type-specific requirements
    if (availabilityData.type === 'RECURRING' && availabilityData.dayOfWeek === undefined) {
      throw new BadRequestException('dayOfWeek is required for recurring availability');
    }

    if (availabilityData.type === 'DATE_SPECIFIC' && !availabilityData.specificDate) {
      throw new BadRequestException('specificDate is required for date-specific availability');
    }

    if (availabilityData.isBlocked && !availabilityData.blockReason) {
      throw new BadRequestException('blockReason is required for blocked time slots');
    }

    // Check for overlapping availability (only for non-blocked slots)
    if (!availabilityData.isBlocked) {
      const where: any = {
        userId,
        isBlocked: false,
        id: excludeId ? { not: excludeId } : undefined,
      };

      if (availabilityData.type === 'RECURRING') {
        where.type = 'RECURRING';
        where.dayOfWeek = availabilityData.dayOfWeek;
      } else if (availabilityData.type === 'DATE_SPECIFIC') {
        where.type = 'DATE_SPECIFIC';
        where.specificDate = new Date(availabilityData.specificDate);
      }

      const overlapping = await this.prisma.availability.findFirst({
        where: {
          ...where,
          OR: [
            {
              startTime: { lt: availabilityData.endTime },
              endTime: { gt: availabilityData.startTime },
            },
          ],
        },
      });

      if (overlapping) {
        throw new ConflictException('Availability slot overlaps with existing availability');
      }
    }
  }

  private generateTimeSlots(
    startTime: string,
    endTime: string,
    duration: number,
    bufferTime: number,
    date: Date,
  ) {
    const slots = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const start = new Date(date);
    start.setHours(startHour, startMinute, 0, 0);

    const end = new Date(date);
    end.setHours(endHour, endMinute, 0, 0);

    const slotDuration = duration + bufferTime;
    let current = new Date(start);

    while (current.getTime() + duration * 60 * 1000 <= end.getTime()) {
      const slotEnd = new Date(current.getTime() + duration * 60 * 1000);
      
      slots.push({
        startTime: current.toISOString(),
        endTime: slotEnd.toISOString(),
      });

      current = new Date(current.getTime() + slotDuration * 60 * 1000);
    }

    return slots;
  }

  private combineDateTime(date: Date, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }

  private timeSlotOverlaps(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ): boolean {
    return start1 < end2 && end1 > start2;
  }
}
