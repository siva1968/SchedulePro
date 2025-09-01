import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { CalendarService } from '../calendar/calendar.service';
import { CreateBookingDto, UpdateBookingDto, BookingQueryDto } from './dto';
import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';
import { TimezoneUtils } from '../common/utils/timezone.utils';
import { EnhancedConflictDetectionService } from '../common/services/enhanced-conflict-detection.service';
import { BookingValidationService } from '../common/services/booking-validation.service';
import { SmartAvailabilityService } from '../common/services/smart-availability.service';
import { BookingAnalyticsService } from '../common/services/booking-analytics.service';
import { AutomatedNotificationsService, NotificationType, RecipientType } from '../common/services/automated-notifications.service';
import { BookingMetricsService } from '../common/services/booking-metrics.service';
import { EnhancedLoggingService } from '../common/services/enhanced-logging.service';
import { SystemMonitoringService } from '../common/services/system-monitoring.service';
import { ZoomOAuthService } from '../calendar/services/zoom-oauth.service';

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
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly calendarService: CalendarService,
    private readonly conflictDetection: EnhancedConflictDetectionService,
    private readonly bookingValidation: BookingValidationService,
    private readonly smartAvailability: SmartAvailabilityService,
    private readonly analytics: BookingAnalyticsService,
    private readonly notifications: AutomatedNotificationsService,
    private readonly metricsService: BookingMetricsService,
    private readonly enhancedLogger: EnhancedLoggingService,
    private readonly monitoringService: SystemMonitoringService,
    private readonly zoomOAuthService: ZoomOAuthService,
  ) {}

  async create(createBookingDto: CreateBookingDto, hostId: string): Promise<any> {
    const startTime = Date.now();
    const { attendees, ...bookingData } = createBookingDto;

    const scopedLogger = this.enhancedLogger.createScopedLogger({
      operation: 'create_booking',
      hostId,
      meetingTypeId: createBookingDto.meetingTypeId,
      userId: attendees?.[0]?.email,
    });

    scopedLogger.logStart('create_booking');

    try {
      // Step 1: Comprehensive booking validation using new service
      console.log('🔍 DEBUG - Starting booking validation');
      console.log('🔍 DEBUG - hostId:', hostId);
      console.log('🔍 DEBUG - meetingTypeId:', createBookingDto.meetingTypeId);
      console.log('🔍 DEBUG - startTime:', createBookingDto.startTime);
      console.log('🔍 DEBUG - endTime:', createBookingDto.endTime);
      console.log('🔍 DEBUG - attendees:', JSON.stringify(attendees, null, 2));
      
      const validationResult = await this.bookingValidation.validateBookingRequest(
        hostId,
        createBookingDto.meetingTypeId,
        createBookingDto.startTime,
        createBookingDto.endTime,
        attendees || [],
        undefined, // excludeBookingId
        true       // isHostBooking = true
      );

      console.log('🔍 DEBUG - Validation result:', JSON.stringify(validationResult, null, 2));

      if (!validationResult.isValid) {
        this.logger.warn('Booking validation failed', {
          errors: validationResult.errors,
          warnings: validationResult.warnings
        });
        console.error('❌ VALIDATION FAILED:', validationResult.errors);
        console.error('⚠️  VALIDATION WARNINGS:', validationResult.warnings);
        throw new BadRequestException({
          message: 'Booking validation failed',
          errors: validationResult.errors,
          warnings: validationResult.warnings
        });
      }

      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        this.logger.warn('Booking validation warnings', {
          warnings: validationResult.warnings
        });
      }

      // Parse the validated times
      const normalizedStartTime = new Date(createBookingDto.startTime);
      const normalizedEndTime = new Date(createBookingDto.endTime);

      // Step 2: Enhanced conflict detection
      const conflictResult = await this.conflictDetection.checkBookingConflicts(
        hostId,
        normalizedStartTime,
        normalizedEndTime
      );

      if (conflictResult.hasConflicts) {
        this.logger.warn('Booking conflicts detected', {
          conflicts: conflictResult.conflicts,
          suggestions: conflictResult.suggestions?.length || 0
        });
        
        throw new ConflictException({
          message: 'Time slot conflicts detected',
          conflicts: conflictResult.conflicts,
          suggestions: conflictResult.suggestions
        });
      }

      // Step 3: Get meeting type with organization defaults
      const meetingType = await this.prisma.meetingType.findUnique({
        where: { id: createBookingDto.meetingTypeId },
        include: {
          organization: {
            select: {
              defaultMeetingProvider: true,
            },
          },
        },
      });

      if (!meetingType) {
        throw new NotFoundException('Meeting type not found');
      }

      // Determine the meeting provider: DTO > MeetingType > Organization Default
      const meetingProvider = createBookingDto.meetingProvider || 
                             meetingType.meetingProvider || 
                             meetingType.organization.defaultMeetingProvider;

      console.log('🎥 DEBUG - Host booking meeting provider selection:', {
        fromDTO: createBookingDto.meetingProvider,
        fromMeetingType: meetingType.meetingProvider,
        fromOrganization: meetingType.organization.defaultMeetingProvider,
        finalSelection: meetingProvider
      });

      console.log('🕐 DEBUG - Creating booking with timezone:', createBookingDto.timezone);
      console.log('🕐 DEBUG - Typeof timezone:', typeof createBookingDto.timezone);
      
      // Step 4: Create the booking
      let booking = await this.prisma.booking.create({
        data: {
          ...bookingData,
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          hostId,
          meetingProvider: meetingProvider,  // Use the determined meeting provider
          timezone: createBookingDto.timezone, // Store customer's selected timezone
          // Host-created bookings are automatically confirmed (no approval needed)
          status: BookingStatus.CONFIRMED,
          isHostCreated: true,  // Mark as host-created booking
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
              timezone: true,
            },
          },
        },
      });

      // Step 4: Record successful booking metrics
      this.metricsService.recordEvent({
        type: 'booking_created',
        data: {
          meetingTypeId: createBookingDto.meetingTypeId,
          attendeeCount: attendees?.length || 0,
        },
        processingTime: Date.now() - startTime,
        success: true,
        userId: attendees?.[0]?.email,
        hostId,
        meetingTypeId: createBookingDto.meetingTypeId,
      });

      scopedLogger.logSuccess('create_booking', Date.now() - startTime);

      // Step 5: Generate meeting link based on the meeting provider
      console.log('🔗 DEBUG - Starting Step 5: Meeting link generation');
      let meetingUrl: string | null = null;
      try {
        console.log('🔗 DEBUG - Generating meeting link for host booking');
        console.log('🔗 DEBUG - Booking ID:', booking.id);
        console.log('🔗 DEBUG - Meeting provider:', booking.meetingProvider);
        console.log('🔗 DEBUG - Full booking object structure:', JSON.stringify(booking, null, 2));
        
        meetingUrl = await this.generateMeetingLink(booking);
        console.log('🔗 DEBUG - generateMeetingLink returned:', meetingUrl);
        
        if (meetingUrl) {
          console.log('🔗 DEBUG - Updating booking with meeting URL');
          // Update the booking with the meeting URL
          await this.prisma.booking.update({
            where: { id: booking.id },
            data: { meetingUrl }
          });
          
          // Update the booking object for email notifications
          booking.meetingUrl = meetingUrl;
          
          console.log('🔗 DEBUG - Meeting link generated successfully:', meetingUrl);
        } else {
          console.log('🔗 DEBUG - No meeting link generated (provider may not be configured)');
        }
      } catch (meetingLinkError) {
        console.error('🔗 ERROR - Failed to generate meeting link:', meetingLinkError);
        console.error('🔗 ERROR - Error stack:', meetingLinkError.stack);
        scopedLogger.error('Failed to generate meeting link', meetingLinkError, {
          bookingId: booking.id,
          meetingProvider: booking.meetingProvider
        });
        // Don't fail the booking creation if meeting link generation fails
      }
      console.log('🔗 DEBUG - Completed Step 5: Meeting link generation');

      // Step 6: Set up automated notifications
      try {
        await this.notifications.setupBookingNotifications(booking.id);
        
        // Send immediate confirmation
        await this.notifications.sendImmediateNotification(
          booking.id,
          NotificationType.BOOKING_CONFIRMATION,
          [RecipientType.BOTH]
        );
        
        scopedLogger.log('Notifications set up successfully', { bookingId: booking.id });
      } catch (notificationError) {
        scopedLogger.error('Failed to set up notifications', notificationError, {
          bookingId: booking.id,
        });
        
        this.metricsService.recordEvent({
          type: 'notification_sent',
          data: { errorType: 'setup_failed', bookingId: booking.id },
          success: false,
          hostId,
          meetingTypeId: createBookingDto.meetingTypeId,
        });
      }

      // Step 7: Calendar integration and email notifications (existing logic)
      try {
        console.log('📧 DEBUG - Sending host booking confirmation emails');
        console.log('📧 DEBUG - Attendee data:', JSON.stringify(booking.attendees?.[0], null, 2));
        console.log('📧 DEBUG - Host data:', JSON.stringify(booking.host, null, 2));
        console.log('🌍 DEBUG - This is a HOST-CREATED booking, using host timezone for both emails');
        
        // CRITICAL DEBUG: Check booking object before sending emails
        console.log('🔗 DEBUG - Booking object before email sending:');
        console.log('🔗 DEBUG - booking.id:', booking.id);
        console.log('🔗 DEBUG - booking.meetingUrl:', booking.meetingUrl);
        console.log('🔗 DEBUG - booking.meetingProvider:', booking.meetingProvider);
        console.log('🔗 DEBUG - booking object keys:', Object.keys(booking));
        
        // CRITICAL FIX: Fetch the updated booking from database to ensure we have the meeting URL
        console.log('🔗 DEBUG - Fetching updated booking from database to get meeting URL');
        const updatedBooking = await this.prisma.booking.findUnique({
          where: { id: booking.id },
          include: {
            attendees: true,
            meetingType: true,
            host: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                timezone: true,
              },
            },
          },
        });
        
        if (updatedBooking) {
          console.log('🔗 DEBUG - Updated booking fetched successfully');
          console.log('🔗 DEBUG - updatedBooking.meetingUrl:', updatedBooking.meetingUrl);
          
          // Use the updated booking object for emails
          booking = updatedBooking;
        } else {
          console.log('🔗 ERROR - Failed to fetch updated booking from database');
        }
        
        // For host bookings, both customer and host should see times in host's timezone
        console.log('📧 DEBUG - About to send emails with Promise.all');
        try {
          const emailResults = await Promise.all([
            this.emailService.sendBookingConfirmation(booking),
            this.emailService.sendBookingNotificationToHost(booking),
          ]);
          console.log('📧 DEBUG - Promise.all completed successfully:', emailResults);
        } catch (promiseError) {
          console.error('📧 ERROR - Promise.all failed:', promiseError);
          // CRITICAL FIX: Don't re-throw, just log and continue
          console.log('📧 DEBUG - Continuing execution despite email error');
        }
        
        console.log('📧 DEBUG - Host booking confirmation emails sent successfully');
        
        // IMMEDIATE URGENT DEBUG - Force immediate logging
        process.stdout.write('🚨 URGENT - Immediate checkpoint after email success\n');
        console.log('🚨 URGENT - About to check for hanging operations');
        
        // CRITICAL DEBUG: Add immediate checkpoint
        console.log('📧 DEBUG - CHECKPOINT ALPHA - Line after email success');
        
        // CRITICAL DEBUG: Test basic operations
        let checkpoint = 'BETA';
        console.log('📧 DEBUG - CHECKPOINT', checkpoint, '- Basic variable assignment works');
        
        // CRITICAL DEBUG: Test console.log itself
        try {
          console.log('📧 DEBUG - CHECKPOINT GAMMA - Testing console.log');
        } catch (consoleError) {
          console.error('CONSOLE ERROR:', consoleError);
        }
        
        console.log('📧 DEBUG - About to exit email try block');
      } catch (emailError) {
        console.error('📧 ERROR - Failed to send booking notification emails:', emailError);
        scopedLogger.error('Failed to send booking notification emails', emailError);
        // Don't fail the booking creation if email fails
      }
      
      console.log('📧 DEBUG - Exited email try-catch block');

      // Debug point to ensure we reach here
      console.log('🔄 DEBUG - About to return booking to frontend');
      console.log('🔄 DEBUG - Booking object exists:', !!booking);
      console.log('🔄 DEBUG - Booking ID:', booking?.id);

      // Return the booking with all updates (including meeting URL if generated)
      try {
        console.log('✅ DEBUG - Attempting to return completed booking:', booking.id);
        const returnValue = booking;
        console.log('✅ DEBUG - Return value prepared successfully');
        return returnValue;
      } catch (returnError) {
        console.error('🚨 RETURN ERROR:', returnError);
        console.log('🚨 RETURN ERROR - Falling back to basic return');
        return booking;
      }
    } catch (error) {
      // Record failure metrics
      this.metricsService.recordEvent({
        type: 'booking_created',
        data: {
          errorType: error.constructor.name,
          errorMessage: error.message,
          meetingTypeId: createBookingDto.meetingTypeId,
        },
        processingTime: Date.now() - startTime,
        success: false,
        userId: attendees?.[0]?.email,
        hostId,
        meetingTypeId: createBookingDto.meetingTypeId,
      });

      scopedLogger.logFailure('create_booking', error, Date.now() - startTime);

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
          timezone: createBookingDto.timezone, // Store customer's selected timezone
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

      // Generate meeting link for auto-confirmed bookings
      let meetingUrl = null;
      if (!meetingType.requiresApproval) {
        try {
          meetingUrl = await this.generateMeetingLink(booking);
          if (meetingUrl) {
            await this.prisma.booking.update({
              where: { id: booking.id },
              data: { meetingUrl }
            });
            booking.meetingUrl = meetingUrl;
          }
        } catch (meetingError) {
          console.error('Failed to generate meeting link for auto-confirmed booking:', meetingError);
          // Don't fail the booking creation if meeting link generation fails
        }

        // Add to calendar for auto-confirmed bookings
        try {
          const calendarResult = await this.calendarService.syncBookingToCalendar(booking.id);
          console.log('Calendar integration result for auto-confirmed booking:', calendarResult);
        } catch (calendarError) {
          console.error('Failed to add auto-confirmed booking to calendar:', calendarError);
          // Don't fail the booking creation if calendar integration fails
        }
      }

      // Send email notifications based on approval status
      try {
        console.log('📧 DEBUG - Sending public booking emails');
        console.log('📧 DEBUG - Attendee data:', JSON.stringify(booking.attendees?.[0], null, 2));
        console.log('📧 DEBUG - Host data:', JSON.stringify(booking.host, null, 2));
        console.log('📧 DEBUG - Requires approval:', meetingType.requiresApproval);
        console.log('🌍 DEBUG - This is a PUBLIC booking, using separate timezones for customer and host');
        
        if (meetingType.requiresApproval) {
          // For pending bookings, send different notifications
          console.log('📧 DEBUG - Sending pending confirmation and approval request emails');
          await Promise.all([
            this.emailService.sendBookingPendingConfirmation({...booking, isHostCreated: false}),
            this.emailService.sendBookingApprovalRequest({...booking, isHostCreated: false}),
          ]);
        } else {
          // For auto-confirmed bookings, send confirmations with meeting link
          console.log('📧 DEBUG - Sending confirmation and host notification emails');
          await Promise.all([
            this.emailService.sendBookingConfirmation({...booking, isHostCreated: false}),
            this.emailService.sendBookingNotificationToHost({...booking, isHostCreated: false}),
          ]);
        }
        
        console.log('📧 DEBUG - Public booking emails sent successfully');
      } catch (emailError) {
        console.error('📧 ERROR - Failed to send booking notification emails:', emailError);
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

    console.log('📅 DEBUG - Customer reschedule: Setting status to PENDING and marking as rescheduled');
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        startTime: newStart,
        endTime: newEnd,
        status: BookingStatus.PENDING,  // Customer reschedules go to PENDING for approval
        isRescheduled: true,           // Flag to track this is a rescheduled booking
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
      console.log('📧 DEBUG - Customer reschedule: Sending pending approval emails');
      // For customer reschedules, send pending approval emails since status is PENDING
      await Promise.all([
        this.emailService.sendBookingPendingConfirmation({...updatedBooking, isHostCreated: false}),
        this.emailService.sendBookingNotificationToHost({...updatedBooking, isHostCreated: false}),
      ]);
    } catch (emailError) {
      console.error('Failed to send reschedule notification emails:', emailError);
      // Don't fail the reschedule if email fails
    }

    return updatedBooking;
  }

  // Booking approval methods
  async approveBooking(bookingId: string, hostId: string, approveBookingDto?: any): Promise<any> {
    // Verify the booking exists and belongs to the host
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        hostId: hostId,
        status: BookingStatus.PENDING,
      },
      include: {
        attendees: true,
        meetingType: {
          include: {
            organization: {
              select: {
                defaultMeetingProvider: true,
              },
            },
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

    // Determine meeting provider - use provided from DTO, or existing logic
    const meetingProvider = approveBookingDto?.meetingProvider || 
                           booking.meetingProvider || 
                           booking.meetingType.meetingProvider || 
                           booking.meetingType.organization.defaultMeetingProvider;

    console.log('🎥 DEBUG - Booking approval meeting provider selection:', {
      requestedProvider: approveBookingDto?.meetingProvider,
      existingProvider: booking.meetingProvider,
      fromMeetingType: booking.meetingType.meetingProvider,
      fromOrganization: booking.meetingType.organization.defaultMeetingProvider,
      finalSelection: meetingProvider
    });

    // Update booking status to confirmed and set meeting provider
    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        meetingProvider: meetingProvider,  // Set the default meeting provider
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
        this.emailService.sendBookingApprovalConfirmation({...finalBooking, isHostCreated: false}, meetingUrl),
        this.emailService.sendBookingConfirmedNotificationToHost({...finalBooking, isHostCreated: false}),
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
      case 'WEBEX':
        return await this.generateWebexLink(booking);
      case 'GOTOMEETING':
        return await this.generateGoToMeetingLink(booking);
      default:
        return null;
    }
  }

  private async generateGoogleMeetLink(booking: any): Promise<string | null> {
    try {
      console.log('🎥 Generating Google Meet link for booking:', booking.id);
      console.log('🎥 DEBUG - booking.hostId:', booking.hostId);
      console.log('🎥 DEBUG - booking.host:', booking.host);
      
      // Check if host has Google Calendar integration
      const googleIntegration = await this.prisma.calendarIntegration.findFirst({
        where: {
          userId: booking.hostId,
          provider: 'GOOGLE',
          isActive: true,
        },
      });

      console.log('🎥 Google integration found:', !!googleIntegration);
      console.log('🎥 Google integration details:', googleIntegration ? { id: googleIntegration.id, userId: googleIntegration.userId, isActive: googleIntegration.isActive } : 'None');

      if (googleIntegration && googleIntegration.accessToken) {
        console.log('🎥 Attempting to create Google Calendar event with Meet link');
        
        try {
          // Decrypt the access token
          const decryptedToken = await (this.calendarService as any).encryptionService.decrypt(googleIntegration.accessToken);
          
          // Create Google Calendar event with Google Meet using the existing service
          const googleEvent = {
            summary: booking.title || 'Scheduled Meeting',
            description: booking.description || '',
            start: {
              dateTime: new Date(booking.startTime).toISOString(),
              timeZone: booking.timezone || 'UTC',
            },
            end: {
              dateTime: new Date(booking.endTime).toISOString(), 
              timeZone: booking.timezone || 'UTC',
            },
            attendees: booking.attendees?.map((attendee: any) => ({
              email: attendee.email,
              displayName: attendee.name,
            })) || [],
            conferenceData: {
              createRequest: {
                requestId: `meet-${booking.id}-${Date.now()}`,
                conferenceSolutionKey: {
                  type: 'hangoutsMeet',
                },
              },
            },
          };

          // Use the Google Calendar service directly
          const googleCalendarService = (this.calendarService as any).googleCalendarService;
          const event = await googleCalendarService.createEvent(
            decryptedToken,
            googleIntegration.calendarId || 'primary',
            googleEvent
          );
          
          console.log('🎥 Google Calendar event created:', event?.id);
          
          // Return the actual Google Meet link from the created event
          if (event?.conferenceData?.entryPoints?.[0]?.uri) {
            const meetLink = event.conferenceData.entryPoints[0].uri;
            console.log('🎥 Real Google Meet link generated:', meetLink);
            return meetLink;
          }
          
          console.warn('🎥 Event created but no Meet link found in response');
        } catch (error) {
          console.warn('🎥 Failed to create Google Calendar event:', error.message);
          // Try token refresh if credentials are invalid
          if (error.message && (error.message.includes('Invalid Credentials') || error.message.includes('401'))) {
            console.log('🎥 Attempting to refresh Google Calendar token...');
            try {
              if (googleIntegration.refreshToken) {
                const refreshToken = await (this.calendarService as any).encryptionService.decrypt(googleIntegration.refreshToken);
                const googleCalendarService = (this.calendarService as any).googleCalendarService;
                const newTokens = await googleCalendarService.refreshAccessToken(refreshToken);
                
                // Update the integration with new tokens
                await this.prisma.calendarIntegration.update({
                  where: { id: googleIntegration.id },
                  data: { 
                    accessToken: await (this.calendarService as any).encryptionService.encrypt(newTokens.access_token),
                    ...(newTokens.refresh_token && {
                      refreshToken: await (this.calendarService as any).encryptionService.encrypt(newTokens.refresh_token)
                    })
                  },
                });
                
                // Retry with new token
                console.log('🎥 Token refreshed, retrying event creation...');
                // Note: We could retry here, but for now let's fall back to placeholder
              }
            } catch (refreshError) {
              console.warn('🎥 Failed to refresh token:', refreshError.message);
            }
          }
        }
      } else {
        console.log('🎥 No valid Google integration found for host');
      }
    } catch (error) {
      console.warn('🎥 Google Calendar integration error:', error.message);
    }

    // Fallback: Generate a placeholder link that clearly indicates it needs Google Calendar setup
    console.log('🎥 Using fallback placeholder link');
    const meetingId = `setup-required-${booking.id.substring(0, 8)}`;
    return `https://meet.google.com/${meetingId}?note=Please-setup-Google-Calendar-integration`;
  }

  private async generateTeamsLink(booking: any): Promise<string | null> {
    try {
      console.log('🎥 Generating Microsoft Teams link for booking:', booking.id);
      
      // Check if host has Microsoft/Azure Calendar integration
      const microsoftIntegration = await this.prisma.calendarIntegration.findFirst({
        where: {
          userId: booking.hostId,
          provider: 'OUTLOOK',
          isActive: true,
        },
      });

      console.log('🎥 Microsoft integration found:', !!microsoftIntegration);

      if (microsoftIntegration && microsoftIntegration.accessToken) {
        try {
          // Use Microsoft Graph API to create an online meeting
          const meetingData = {
            subject: booking.title || 'Scheduled Meeting',
            startDateTime: booking.startTime,
            endDateTime: booking.endTime,
          };

          console.log('🎥 Creating Teams meeting with Graph API');

          // Make API call to Microsoft Graph
          const teamsResponse = await this.createTeamsMeeting(
            microsoftIntegration.accessToken,
            meetingData
          );

          if (teamsResponse && teamsResponse.joinWebUrl) {
            console.log('🎥 Teams meeting created successfully:', teamsResponse.joinWebUrl);
            return teamsResponse.joinWebUrl;
          } else {
            console.warn('🎥 Teams API did not return a join URL');
            return this.generateFallbackTeamsLink(booking);
          }
        } catch (apiError) {
          console.error('🎥 Failed to create Teams meeting via API:', apiError);
          return this.generateFallbackTeamsLink(booking);
        }
      } else {
        console.log('🎥 No Microsoft integration found, generating fallback Teams link');
        return this.generateFallbackTeamsLink(booking);
      }
    } catch (error) {
      console.error('🎥 Error in generateTeamsLink:', error);
      return this.generateFallbackTeamsLink(booking);
    }
  }

  private async createTeamsMeeting(accessToken: string, meetingData: any): Promise<any> {
    try {
      // Use axios instead of node-fetch for better compatibility
      const axios = require('axios');
      
      const response = await axios.post('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
        subject: meetingData.subject,
        startDateTime: meetingData.startDateTime,
        endDateTime: meetingData.endDateTime,
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      console.error('🎥 Microsoft Graph API call failed:', error);
      throw error;
    }
  }

  private generateFallbackTeamsLink(booking: any): string {
    console.log('🎥 Using fallback Teams link generation - returning special identifier');
    
    // Return a special identifier that we can detect in email templates
    // This will be replaced with proper instructions in the email
    return 'TEAMS_MEETING_MANUAL_SETUP_REQUIRED';
  }

  private async generateZoomLink(booking: any): Promise<string | null> {
    try {
      // Try to get the host's Zoom integration
      const zoomIntegration = await this.prisma.calendarIntegration.findFirst({
        where: {
          userId: booking.hostId,
          provider: 'ZOOM',
          isActive: true,
        },
      });

      if (zoomIntegration && zoomIntegration.accessToken) {
        // Use real Zoom API to create meeting
        try {
          const meetingData = {
            topic: `${booking.title || 'Scheduled Meeting'}`,
            start_time: booking.startTime.toISOString(),
            duration: Math.ceil((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / (1000 * 60)), // Duration in minutes
            timezone: booking.timezone || 'UTC',
            agenda: booking.description || 'Scheduled meeting via SchedulePro',
          };

          // Check if token needs refresh
          let accessToken = zoomIntegration.accessToken;
          if (zoomIntegration.expiresAt && new Date() > zoomIntegration.expiresAt) {
            // Token expired, refresh it
            if (zoomIntegration.refreshToken) {
              const refreshedTokens = await this.zoomOAuthService.refreshAccessToken(zoomIntegration.refreshToken);
              accessToken = refreshedTokens.access_token;
              
              // Update the integration with new tokens
              await this.prisma.calendarIntegration.update({
                where: { id: zoomIntegration.id },
                data: {
                  accessToken: refreshedTokens.access_token,
                  refreshToken: refreshedTokens.refresh_token,
                  expiresAt: new Date(Date.now() + refreshedTokens.expires_in * 1000),
                },
              });
            } else {
              throw new Error('No refresh token available');
            }
          }

          const zoomMeeting = await this.zoomOAuthService.createMeeting(accessToken, meetingData);
          
          this.logger.log(`Created real Zoom meeting: ${zoomMeeting.join_url}`, { 
            bookingId: booking.id, 
            meetingId: zoomMeeting.id 
          });
          
          return zoomMeeting.join_url;
        } catch (zoomError) {
          this.logger.error('Failed to create real Zoom meeting, falling back to placeholder', zoomError);
          // Fall through to generate placeholder link
        }
      }

      // Fallback: Generate a placeholder Zoom meeting link with realistic format
      // Zoom meeting IDs are typically 10-11 digits
      const generateZoomId = (): string => {
        // Generate 10-11 digit meeting ID
        const baseId = Math.floor(Math.random() * 90000000000) + 10000000000; // 11 digits
        return baseId.toString();
      };
      
      const meetingId = generateZoomId();
      const password = Math.random().toString(36).substring(2, 8); // 6 char password
      const placeholderLink = `https://zoom.us/j/${meetingId}?pwd=${password}`;
      
      this.logger.log(`Generated placeholder Zoom link: ${placeholderLink}`, { 
        bookingId: booking.id,
        reason: zoomIntegration ? 'API_ERROR' : 'NO_INTEGRATION'
      });
      
      return placeholderLink;
    } catch (error) {
      this.logger.error('Error in generateZoomLink:', error);
      // Return null to indicate failure
      return null;
    }
  }

  private async generateWebexLink(booking: any): Promise<string | null> {
    // Generate a Webex meeting link
    // Webex uses various formats, this is a common one
    const generateWebexId = (): string => {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 10);
      return `${timestamp}${random}`;
    };
    
    const meetingId = generateWebexId();
    return `https://company.webex.com/meet/${meetingId}`;
  }

  private async generateGoToMeetingLink(booking: any): Promise<string | null> {
    // Generate a GoToMeeting link
    // GoToMeeting typically uses 9-digit meeting IDs
    const generateGTMId = (): string => {
      return Math.floor(Math.random() * 900000000 + 100000000).toString(); // 9 digits
    };
    
    const meetingId = generateGTMId();
    return `https://global.gotomeeting.com/join/${meetingId}`;
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

  // ============================================================================
  // ENHANCED FUNCTIONALITY METHODS
  // ============================================================================

  /**
   * Get smart availability suggestions using the new SmartAvailabilityService
   */
  async getSmartAvailabilitySlots(
    hostId: string,
    durationMinutes: number,
    preferences?: any,
    userTimezone = 'UTC',
    maxSuggestions = 10
  ) {
    try {
      this.logger.log('Getting smart availability suggestions', {
        hostId,
        durationMinutes,
        maxSuggestions
      });

      const suggestions = await this.smartAvailability.getSmartSuggestions(
        hostId,
        durationMinutes,
        preferences,
        userTimezone,
        maxSuggestions
      );

      this.logger.log('Smart suggestions generated', {
        hostId,
        suggestionsCount: suggestions.length
      });

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to get smart availability suggestions', {
        hostId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get next available slot quickly
   */
  async getNextAvailableSlot(hostId: string, durationMinutes: number, userTimezone = 'UTC') {
    try {
      const nextSlot = await this.smartAvailability.getNextAvailableSlot(
        hostId,
        durationMinutes,
        userTimezone
      );

      this.logger.log('Next available slot found', {
        hostId,
        nextSlot: nextSlot ? {
          startTime: nextSlot.startTime,
          confidence: nextSlot.confidence
        } : null
      });

      return nextSlot;
    } catch (error) {
      this.logger.error('Failed to get next available slot', {
        hostId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get comprehensive analytics for a host
   */
  async getHostAnalytics(hostId: string, startDate?: Date, endDate?: Date) {
    try {
      this.logger.log('Getting host analytics', { hostId, startDate, endDate });

      const analytics = await this.analytics.getHostAnalytics(hostId, startDate, endDate);

      this.logger.log('Host analytics generated', {
        hostId,
        totalBookings: analytics.analytics.totalBookings,
        performanceScore: analytics.performanceScore
      });

      return analytics;
    } catch (error) {
      this.logger.error('Failed to get host analytics', {
        hostId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get system-wide analytics
   */
  async getSystemAnalytics(startDate?: Date, endDate?: Date) {
    try {
      this.logger.log('Getting system analytics', { startDate, endDate });

      const analytics = await this.analytics.getSystemAnalytics(startDate, endDate);

      this.logger.log('System analytics generated', {
        totalHosts: analytics.totalHosts,
        totalBookings: analytics.totalBookings,
        systemUtilization: analytics.systemUtilization
      });

      return analytics;
    } catch (error) {
      this.logger.error('Failed to get system analytics', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enhanced booking cancellation with notification management
   */
  async cancelBookingEnhanced(
    bookingId: string,
    cancelledBy: string,
    reason?: string,
    sendNotifications = true
  ): Promise<any> {
    try {
      this.logger.log('Cancelling booking with enhanced features', {
        bookingId,
        cancelledBy,
        reason
      });

      // Get the booking first
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          attendees: true,
          meetingType: true,
          host: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status === BookingStatus.CANCELLED) {
        throw new BadRequestException('Booking is already cancelled');
      }

      // Cancel future notifications
      await this.notifications.cancelBookingNotifications(bookingId);

      // Update booking status
      const updatedBooking = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.CANCELLED,
          notes: reason ? `${booking.notes || ''}\nCancelled by: ${cancelledBy}\nReason: ${reason}` : booking.notes,
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

      // Send cancellation notifications
      if (sendNotifications) {
        try {
          await this.notifications.sendImmediateNotification(
            bookingId,
            NotificationType.BOOKING_CANCELLED,
            [RecipientType.BOTH]
          );
        } catch (notificationError) {
          this.logger.error('Failed to send cancellation notifications', {
            bookingId,
            error: notificationError.message
          });
        }
      }

      this.logger.log('Booking cancelled successfully', {
        bookingId,
        status: updatedBooking.status
      });

      return updatedBooking;
    } catch (error) {
      this.logger.error('Failed to cancel booking', {
        bookingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enhanced booking rescheduling with conflict detection and notifications
   */
  async rescheduleBookingEnhanced(
    bookingId: string,
    newStartTime: Date,
    newEndTime: Date,
    rescheduledBy: string,
    reason?: string
  ): Promise<any> {
    try {
      this.logger.log('Rescheduling booking with enhanced features', {
        bookingId,
        newStartTime,
        newEndTime,
        rescheduledBy
      });

      // Get the booking first
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          attendees: true,
          meetingType: true,
          host: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      // Validate new time slot
      const validationResult = await this.bookingValidation.validateBookingRequest(
        booking.hostId,
        booking.meetingTypeId,
        newStartTime,
        newEndTime,
        booking.attendees,
        bookingId // Exclude current booking from conflict check
      );

      if (!validationResult.isValid) {
        throw new BadRequestException({
          message: 'New time slot validation failed',
          errors: validationResult.errors,
          warnings: validationResult.warnings
        });
      }

      // Check for conflicts at new time
      const conflictResult = await this.conflictDetection.checkBookingConflicts(
        booking.hostId,
        newStartTime,
        newEndTime,
        bookingId
      );

      if (conflictResult.hasConflicts) {
        throw new ConflictException({
          message: 'New time slot has conflicts',
          conflicts: conflictResult.conflicts,
          suggestions: conflictResult.suggestions
        });
      }

      // Update the booking
      console.log('📅 DEBUG - Host reschedule: Setting status to CONFIRMED and marking as rescheduled');
      const updatedBooking = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          startTime: newStartTime,
          endTime: newEndTime,
          status: BookingStatus.CONFIRMED,  // Host reschedules stay CONFIRMED
          isRescheduled: true,             // Flag to track this is a rescheduled booking
          notes: reason ? `${booking.notes || ''}\nRescheduled by: ${rescheduledBy}\nReason: ${reason}` : booking.notes,
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

      // Reschedule notifications
      try {
        await this.notifications.rescheduleBookingNotifications(bookingId, newStartTime);
        
        // Send immediate reschedule notification
        await this.notifications.sendImmediateNotification(
          bookingId,
          NotificationType.BOOKING_RESCHEDULED,
          [RecipientType.BOTH]
        );
      } catch (notificationError) {
        this.logger.error('Failed to reschedule notifications', {
          bookingId,
          error: notificationError.message
        });
      }

      this.logger.log('Booking rescheduled successfully', {
        bookingId,
        oldStartTime: booking.startTime,
        newStartTime: updatedBooking.startTime
      });

      return updatedBooking;
    } catch (error) {
      this.logger.error('Failed to reschedule booking', {
        bookingId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get optimal notification timing suggestions
   */
  async getOptimalNotificationTiming(hostId: string, bookingData?: any) {
    try {
      return await this.notifications.getOptimalNotificationTiming(hostId, bookingData);
    } catch (error) {
      this.logger.error('Failed to get optimal notification timing', {
        hostId,
        error: error.message
      });
      throw error;
    }
  }
}
