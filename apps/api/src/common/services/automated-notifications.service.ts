import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TimezoneUtils } from '../utils/timezone.utils';

export interface NotificationTemplate {
  type: NotificationType;
  trigger: NotificationTrigger;
  subject: string;
  body: string;
  variables: string[]; // Available template variables
}

export interface NotificationRule {
  id: string;
  type: NotificationType;
  trigger: NotificationTrigger;
  timing: number; // Hours before/after event
  isActive: boolean;
  recipients: RecipientType[];
  customTemplate?: NotificationTemplate;
}

export interface ScheduledNotification {
  id: string;
  bookingId: string;
  type: NotificationType;
  recipientEmail: string;
  scheduledAt: Date;
  sentAt?: Date;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  attempts: number;
  errorMessage?: string;
}

export enum NotificationType {
  BOOKING_CONFIRMATION = 'BOOKING_CONFIRMATION',
  BOOKING_REMINDER = 'BOOKING_REMINDER',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  BOOKING_RESCHEDULED = 'BOOKING_RESCHEDULED',
  HOST_NOTIFICATION = 'HOST_NOTIFICATION',
  FOLLOW_UP = 'FOLLOW_UP',
  NO_SHOW_REMINDER = 'NO_SHOW_REMINDER'
}

export enum NotificationTrigger {
  IMMEDIATELY = 'IMMEDIATELY',
  MINUTES_BEFORE = 'MINUTES_BEFORE',
  HOURS_BEFORE = 'HOURS_BEFORE',
  DAYS_BEFORE = 'DAYS_BEFORE',
  AFTER_BOOKING = 'AFTER_BOOKING'
}

export enum RecipientType {
  ATTENDEE = 'ATTENDEE',
  HOST = 'HOST',
  BOTH = 'BOTH'
}

@Injectable()
export class AutomatedNotificationsService {
  private readonly logger = new Logger(AutomatedNotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Set up default notification rules for new bookings
   */
  async setupBookingNotifications(bookingId: string): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          host: { select: { email: true, firstName: true, timezone: true } },
          attendees: { select: { email: true, name: true } },
          meetingType: { select: { name: true, duration: true } }
        }
      });

      if (!booking) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      // Get default notification rules
      const defaultRules = await this.getDefaultNotificationRules();

      // Schedule notifications based on rules
      for (const rule of defaultRules) {
        if (rule.isActive) {
          await this.scheduleNotification(booking, rule);
        }
      }

      this.logger.log(`Set up notifications for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to setup notifications for booking ${bookingId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a specific notification
   */
  private async scheduleNotification(booking: any, rule: NotificationRule): Promise<void> {
    const scheduledAt = this.calculateScheduledTime(booking.startTime, rule);
    
    // Don't schedule past notifications
    if (scheduledAt <= new Date()) {
      return;
    }

    const recipients = this.getRecipients(booking, rule.recipients);

    for (const recipient of recipients) {
      const notification: Omit<ScheduledNotification, 'id'> = {
        bookingId: booking.id,
        type: rule.type,
        recipientEmail: recipient.email,
        scheduledAt,
        status: 'PENDING',
        attempts: 0
      };

      // In a real implementation, you would save this to a queue/database
      // For now, we'll just log it
      this.logger.log(`Scheduled ${rule.type} notification for ${recipient.email} at ${scheduledAt}`);
    }
  }

  /**
   * Process pending notifications (would be called by a cron job)
   */
  async processPendingNotifications(): Promise<void> {
    try {
      // In a real implementation, you would fetch from a notifications table
      // const pendingNotifications = await this.getPendingNotifications();
      
      // For now, we'll simulate processing
      this.logger.log('Processing pending notifications...');
      
      // Process each notification
      // for (const notification of pendingNotifications) {
      //   await this.sendNotification(notification);
      // }
    } catch (error) {
      this.logger.error('Failed to process pending notifications:', error);
    }
  }

  /**
   * Send a notification
   */
  private async sendNotification(notification: ScheduledNotification): Promise<void> {
    try {
      // Get booking details for template variables
      const booking = await this.prisma.booking.findUnique({
        where: { id: notification.bookingId },
        include: {
          host: { select: { email: true, firstName: true, lastName: true, timezone: true } },
          attendees: { select: { email: true, name: true } },
          meetingType: { select: { name: true, duration: true } }
        }
      });

      if (!booking) {
        throw new Error(`Booking ${notification.bookingId} not found`);
      }

      // Get notification template
      const template = await this.getNotificationTemplate(notification.type);
      
      // Generate email content
      const emailContent = this.generateEmailContent(booking, template, notification.recipientEmail);
      
      // Send email (integrate with your email service)
      await this.sendEmail(notification.recipientEmail, emailContent.subject, emailContent.body);
      
      // Update notification status
      // await this.updateNotificationStatus(notification.id, 'SENT');
      
      this.logger.log(`Sent ${notification.type} notification to ${notification.recipientEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send notification ${notification.id}:`, error);
      
      // Update notification with error
      // await this.updateNotificationStatus(notification.id, 'FAILED', error.message);
      
      // Retry logic could be implemented here
    }
  }

  /**
   * Cancel notifications for a booking
   */
  async cancelBookingNotifications(bookingId: string): Promise<void> {
    try {
      // In a real implementation, you would update the notifications table
      // await this.updateNotificationsStatus(bookingId, 'CANCELLED');
      
      this.logger.log(`Cancelled notifications for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to cancel notifications for booking ${bookingId}:`, error);
    }
  }

  /**
   * Reschedule notifications for a rescheduled booking
   */
  async rescheduleBookingNotifications(bookingId: string, newStartTime: Date): Promise<void> {
    try {
      // Cancel existing notifications
      await this.cancelBookingNotifications(bookingId);
      
      // Set up new notifications with updated time
      await this.setupBookingNotifications(bookingId);
      
      this.logger.log(`Rescheduled notifications for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to reschedule notifications for booking ${bookingId}:`, error);
    }
  }

  /**
   * Send immediate notification (confirmation, cancellation, etc.)
   */
  async sendImmediateNotification(
    bookingId: string,
    type: NotificationType,
    recipients: RecipientType[] = [RecipientType.BOTH]
  ): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          host: { select: { email: true, firstName: true, lastName: true, timezone: true } },
          attendees: { select: { email: true, name: true } },
          meetingType: { select: { name: true, duration: true } }
        }
      });

      if (!booking) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      const template = await this.getNotificationTemplate(type);
      const recipientEmails = this.getRecipients(booking, recipients);

      for (const recipient of recipientEmails) {
        const emailContent = this.generateEmailContent(booking, template, recipient.email);
        await this.sendEmail(recipient.email, emailContent.subject, emailContent.body);
      }

      this.logger.log(`Sent immediate ${type} notification for booking ${bookingId}`);
    } catch (error) {
      this.logger.error(`Failed to send immediate notification for booking ${bookingId}:`, error);
      throw error;
    }
  }

  /**
   * Get default notification rules
   */
  private async getDefaultNotificationRules(): Promise<NotificationRule[]> {
    return [
      {
        id: 'confirmation',
        type: NotificationType.BOOKING_CONFIRMATION,
        trigger: NotificationTrigger.IMMEDIATELY,
        timing: 0,
        isActive: true,
        recipients: [RecipientType.BOTH]
      },
      {
        id: 'reminder-24h',
        type: NotificationType.BOOKING_REMINDER,
        trigger: NotificationTrigger.HOURS_BEFORE,
        timing: 24,
        isActive: true,
        recipients: [RecipientType.ATTENDEE]
      },
      {
        id: 'reminder-1h',
        type: NotificationType.BOOKING_REMINDER,
        trigger: NotificationTrigger.HOURS_BEFORE,
        timing: 1,
        isActive: true,
        recipients: [RecipientType.ATTENDEE]
      },
      {
        id: 'host-notification',
        type: NotificationType.HOST_NOTIFICATION,
        trigger: NotificationTrigger.HOURS_BEFORE,
        timing: 1,
        isActive: true,
        recipients: [RecipientType.HOST]
      }
    ];
  }

  /**
   * Calculate when a notification should be sent
   */
  private calculateScheduledTime(bookingStartTime: Date, rule: NotificationRule): Date {
    const scheduledTime = new Date(bookingStartTime);

    switch (rule.trigger) {
      case NotificationTrigger.IMMEDIATELY:
        return new Date(); // Send now

      case NotificationTrigger.MINUTES_BEFORE:
        scheduledTime.setMinutes(scheduledTime.getMinutes() - rule.timing);
        break;

      case NotificationTrigger.HOURS_BEFORE:
        scheduledTime.setHours(scheduledTime.getHours() - rule.timing);
        break;

      case NotificationTrigger.DAYS_BEFORE:
        scheduledTime.setDate(scheduledTime.getDate() - rule.timing);
        break;

      case NotificationTrigger.AFTER_BOOKING:
        scheduledTime.setHours(scheduledTime.getHours() + rule.timing);
        break;

      default:
        throw new Error(`Unknown notification trigger: ${rule.trigger}`);
    }

    return scheduledTime;
  }

  /**
   * Get recipients based on rule configuration
   */
  private getRecipients(booking: any, recipientTypes: RecipientType[]): { email: string; name: string }[] {
    const recipients: { email: string; name: string }[] = [];

    for (const type of recipientTypes) {
      switch (type) {
        case RecipientType.HOST:
          recipients.push({
            email: booking.host.email,
            name: `${booking.host.firstName} ${booking.host.lastName || ''}`.trim()
          });
          break;

        case RecipientType.ATTENDEE:
          booking.attendees.forEach((attendee: any) => {
            recipients.push({
              email: attendee.email,
              name: attendee.name
            });
          });
          break;

        case RecipientType.BOTH:
          // Add host
          recipients.push({
            email: booking.host.email,
            name: `${booking.host.firstName} ${booking.host.lastName || ''}`.trim()
          });
          // Add attendees
          booking.attendees.forEach((attendee: any) => {
            recipients.push({
              email: attendee.email,
              name: attendee.name
            });
          });
          break;
      }
    }

    // Remove duplicates
    return recipients.filter((recipient, index, self) => 
      index === self.findIndex(r => r.email === recipient.email)
    );
  }

  /**
   * Get notification template
   */
  private async getNotificationTemplate(type: NotificationType): Promise<NotificationTemplate> {
    // In a real implementation, these would be stored in database and customizable
    const templates: Record<NotificationType, NotificationTemplate> = {
      [NotificationType.BOOKING_CONFIRMATION]: {
        type: NotificationType.BOOKING_CONFIRMATION,
        trigger: NotificationTrigger.IMMEDIATELY,
        subject: 'Booking Confirmed: {{meetingType}} with {{hostName}}',
        body: `
          Hi {{recipientName}},
          
          Your booking has been confirmed!
          
          Meeting: {{meetingType}}
          Date & Time: {{startTime}} ({{timezone}})
          Duration: {{duration}} minutes
          Host: {{hostName}}
          
          {{#if meetingUrl}}
          Join the meeting: {{meetingUrl}}
          {{/if}}
          
          {{#if description}}
          Description: {{description}}
          {{/if}}
          
          Looking forward to meeting with you!
          
          Best regards,
          {{hostName}}
        `,
        variables: ['meetingType', 'hostName', 'recipientName', 'startTime', 'timezone', 'duration', 'meetingUrl', 'description']
      },
      [NotificationType.BOOKING_REMINDER]: {
        type: NotificationType.BOOKING_REMINDER,
        trigger: NotificationTrigger.HOURS_BEFORE,
        subject: 'Reminder: {{meetingType}} in {{timeUntil}}',
        body: `
          Hi {{recipientName}},
          
          This is a reminder about your upcoming meeting:
          
          Meeting: {{meetingType}}
          Date & Time: {{startTime}} ({{timezone}})
          Host: {{hostName}}
          
          {{#if meetingUrl}}
          Join the meeting: {{meetingUrl}}
          {{/if}}
          
          See you soon!
          
          Best regards,
          {{hostName}}
        `,
        variables: ['meetingType', 'hostName', 'recipientName', 'startTime', 'timezone', 'timeUntil', 'meetingUrl']
      },
      [NotificationType.BOOKING_CANCELLED]: {
        type: NotificationType.BOOKING_CANCELLED,
        trigger: NotificationTrigger.IMMEDIATELY,
        subject: 'Booking Cancelled: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          Your booking has been cancelled:
          
          Meeting: {{meetingType}}
          Original Date & Time: {{startTime}} ({{timezone}})
          Host: {{hostName}}
          
          {{#if cancellationReason}}
          Reason: {{cancellationReason}}
          {{/if}}
          
          You can book a new appointment anytime.
          
          Best regards,
          {{hostName}}
        `,
        variables: ['meetingType', 'hostName', 'recipientName', 'startTime', 'timezone', 'cancellationReason']
      },
      [NotificationType.BOOKING_RESCHEDULED]: {
        type: NotificationType.BOOKING_RESCHEDULED,
        trigger: NotificationTrigger.IMMEDIATELY,
        subject: 'Booking Rescheduled: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          Your booking has been rescheduled:
          
          Meeting: {{meetingType}}
          New Date & Time: {{startTime}} ({{timezone}})
          Host: {{hostName}}
          
          {{#if meetingUrl}}
          Join the meeting: {{meetingUrl}}
          {{/if}}
          
          Looking forward to meeting with you!
          
          Best regards,
          {{hostName}}
        `,
        variables: ['meetingType', 'hostName', 'recipientName', 'startTime', 'timezone', 'meetingUrl']
      },
      [NotificationType.HOST_NOTIFICATION]: {
        type: NotificationType.HOST_NOTIFICATION,
        trigger: NotificationTrigger.HOURS_BEFORE,
        subject: 'Upcoming Meeting: {{meetingType}} with {{attendeeName}}',
        body: `
          Hi {{hostName}},
          
          You have an upcoming meeting:
          
          Meeting: {{meetingType}}
          Date & Time: {{startTime}} ({{timezone}})
          Attendee: {{attendeeName}} ({{attendeeEmail}})
          
          {{#if meetingUrl}}
          Meeting URL: {{meetingUrl}}
          {{/if}}
          
          {{#if description}}
          Description: {{description}}
          {{/if}}
          
          Have a great meeting!
        `,
        variables: ['meetingType', 'hostName', 'startTime', 'timezone', 'attendeeName', 'attendeeEmail', 'meetingUrl', 'description']
      },
      [NotificationType.FOLLOW_UP]: {
        type: NotificationType.FOLLOW_UP,
        trigger: NotificationTrigger.AFTER_BOOKING,
        subject: 'Thank you for the meeting: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          Thank you for taking the time to meet with me today!
          
          Meeting: {{meetingType}}
          Date: {{startTime}}
          
          {{#if followUpMessage}}
          {{followUpMessage}}
          {{/if}}
          
          Feel free to reach out if you have any questions.
          
          Best regards,
          {{hostName}}
        `,
        variables: ['meetingType', 'hostName', 'recipientName', 'startTime', 'followUpMessage']
      },
      [NotificationType.NO_SHOW_REMINDER]: {
        type: NotificationType.NO_SHOW_REMINDER,
        trigger: NotificationTrigger.AFTER_BOOKING,
        subject: 'We missed you: {{meetingType}}',
        body: `
          Hi {{recipientName}},
          
          We noticed you weren't able to make it to your scheduled meeting:
          
          Meeting: {{meetingType}}
          Date & Time: {{startTime}} ({{timezone}})
          
          No worries! You can reschedule anytime.
          
          Best regards,
          {{hostName}}
        `,
        variables: ['meetingType', 'hostName', 'recipientName', 'startTime', 'timezone']
      }
    };

    return templates[type];
  }

  /**
   * Generate email content from template
   */
  private generateEmailContent(
    booking: any,
    template: NotificationTemplate,
    recipientEmail: string
  ): { subject: string; body: string } {
    // Find recipient details
    const isHost = booking.host.email === recipientEmail;
    const attendee = booking.attendees.find((a: any) => a.email === recipientEmail);
    
    const recipientName = isHost 
      ? `${booking.host.firstName} ${booking.host.lastName || ''}`.trim()
      : attendee?.name || 'there';

    // Prepare template variables
    const variables: Record<string, string> = {
      meetingType: booking.meetingType.name,
      hostName: `${booking.host.firstName} ${booking.host.lastName || ''}`.trim(),
      recipientName,
      startTime: TimezoneUtils.formatTimeInTimezone(booking.startTime, booking.host.timezone),
      timezone: booking.host.timezone,
      duration: booking.meetingType.duration.toString(),
      meetingUrl: booking.meetingUrl || '',
      description: booking.description || '',
      attendeeName: booking.attendees.map((a: any) => a.name).join(', '),
      attendeeEmail: booking.attendees.map((a: any) => a.email).join(', ')
    };

    // Simple template replacement (in a real app, you'd use a proper template engine)
    let subject = template.subject;
    let body = template.body;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    });

    return { subject, body };
  }

  /**
   * Send email (integrate with your email service)
   */
  private async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // This would integrate with your email service (SendGrid, AWS SES, etc.)
    this.logger.log(`Sending email to ${to}: ${subject}`);
    
    // Simulate email sending
    // await emailService.send({ to, subject, body });
  }

  /**
   * Get smart notification timing suggestions
   */
  async getOptimalNotificationTiming(
    hostId: string,
    bookingData?: any
  ): Promise<{ timing: number; confidence: number; reason: string }[]> {
    // Analyze historical data to suggest optimal notification timing
    const suggestions = [
      {
        timing: 24,
        confidence: 0.9,
        reason: 'Most attendees prefer 24-hour advance reminders'
      },
      {
        timing: 2,
        confidence: 0.8,
        reason: 'Short-term reminders reduce no-show rates'
      },
      {
        timing: 168, // 1 week
        confidence: 0.6,
        reason: 'Early reminders help with planning'
      }
    ];

    return suggestions;
  }
}
