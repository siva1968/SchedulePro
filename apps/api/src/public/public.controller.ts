import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { BookingsService } from '../bookings/bookings.service';

interface CreatePublicBookingDto {
  meetingTypeId: string;
  startTime: string;
  endTime: string;
  title: string;
  description?: string;
  attendees: Array<{
    name: string;
    email: string;
  }>;
}

@ApiTags('Public API')
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

  @Get('organizations/:slug/meeting-types')
  @ApiOperation({ summary: 'Get organization and its public meeting types' })
  @ApiResponse({ status: 200, description: 'Organization and meeting types retrieved successfully' })
  async getOrganizationMeetingTypes(@Param('slug') slug: string) {
    try {
      // Get organization by slug with meeting types
      const organization = await this.prisma.organization.findFirst({
        where: { slug },
        include: {
          meetingTypes: {
            where: { isActive: true },
            include: {
              host: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!organization) {
        throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
      }

      return {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          description: organization.description,
        },
        meetingTypes: organization.meetingTypes.map(mt => ({
          id: mt.id,
          name: mt.name,
          description: mt.description,
          duration: mt.duration,
          isActive: mt.isActive,
          host: mt.host,
          organization: {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
          },
        })),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Failed to retrieve organization data:', error);
      throw new HttpException('Failed to retrieve organization data', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('organizations/:slug/meeting-types/:meetingTypeId/availability')
  @ApiOperation({ summary: 'Get available time slots for a meeting type' })
  @ApiResponse({ status: 200, description: 'Available time slots retrieved successfully' })
  async getAvailableSlots(
    @Param('slug') slug: string,
    @Param('meetingTypeId') meetingTypeId: string,
    @Query('date') date: string,
    @Query('timezone') timezone?: string,
  ) {
    try {
      // Validate date format
      if (!date || !Date.parse(date)) {
        throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
      }

      // Get organization and meeting type
      const organization = await this.prisma.organization.findFirst({
        where: { slug },
      });

      if (!organization) {
        throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
      }

      const meetingType = await this.prisma.meetingType.findFirst({
        where: { 
          id: meetingTypeId,
          organizationId: organization.id,
          isActive: true,
        },
        include: {
          host: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!meetingType) {
        throw new HttpException('Meeting type not found', HttpStatus.NOT_FOUND);
      }

      const selectedDate = new Date(date);

      // Get existing bookings for the selected date and host
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Check for conflicts with ALL bookings for the same host, not just same meeting type
      const existingBookings = await this.prisma.booking.findMany({
        where: {
          meetingType: {
            hostId: meetingType.host.id, // Check by host, not meeting type
          },
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: {
            notIn: ['CANCELLED'],
          },
        },
        select: {
          startTime: true,
          endTime: true,
        },
      });

      // Generate time slots from 9 AM to 5 PM, excluding conflicts
      const availableSlots = [];
      
      // Use the user's timezone if provided, otherwise default to UTC
      const userTimezone = timezone || 'UTC';
      
      for (let hour = 9; hour < 17; hour++) {
        const startTime = new Date(selectedDate);
        startTime.setHours(hour, 0, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + meetingType.duration);

        // Skip if end time is after 5 PM
        if (endTime.getHours() >= 17) break;

        // Check for conflicts with existing bookings
        const hasConflict = existingBookings.some(booking => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          
          // Check if the proposed slot overlaps with any existing booking
          return (
            (startTime >= bookingStart && startTime < bookingEnd) ||
            (endTime > bookingStart && endTime <= bookingEnd) ||
            (startTime <= bookingStart && endTime >= bookingEnd)
          );
        });

        // Only add the slot if there's no conflict
        if (!hasConflict) {
          // Format times in user's timezone
          const startTimeInTZ = startTime.toLocaleString('en-US', {
            timeZone: userTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          
          const endTimeInTZ = endTime.toLocaleString('en-US', {
            timeZone: userTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          
          availableSlots.push({
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            label: `${startTimeInTZ} - ${endTimeInTZ}`,
          });
        }
      }

      return { availableSlots };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Failed to retrieve available slots:', error);
      throw new HttpException('Failed to retrieve available slots', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Create a public booking' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  async createPublicBooking(@Body() createBookingDto: CreatePublicBookingDto) {
    try {
      // Validate meeting type exists and is active
      const meetingType = await this.prisma.meetingType.findFirst({
        where: { 
          id: createBookingDto.meetingTypeId,
          isActive: true,
        },
        include: {
          organization: true,
          host: true,
        },
      });

      if (!meetingType) {
        throw new HttpException('Meeting type not found or inactive', HttpStatus.NOT_FOUND);
      }

      // Convert the public booking DTO to the internal booking DTO format
      const internalBookingDto = {
        meetingTypeId: createBookingDto.meetingTypeId,
        startTime: createBookingDto.startTime,
        endTime: createBookingDto.endTime,
        title: createBookingDto.title,
        description: createBookingDto.description,
        attendees: createBookingDto.attendees,
      };

      // Use the BookingsService which has proper conflict detection
      const booking = await this.bookingsService.create(internalBookingDto, meetingType.hostId);

      return {
        id: booking.id,
        title: booking.title,
        startTime: booking.startTime,
        endTime: booking.endTime,
        status: booking.status,
        meetingType: {
          name: booking.meetingType.name,
          duration: booking.meetingType.duration,
        },
        attendees: booking.attendees,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Failed to create public booking:', error);
      throw new HttpException('Failed to create booking', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
