import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { EmailOptions, EmailSendResult } from './interfaces/email-provider.interface';

@Injectable()
export class EnhancedEmailService {
  private readonly logger = new Logger(EnhancedEmailService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * Get user's preferred timezone from database
   * Falls back to system timezone if not found
   */
  private async getUserTimezone(userId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true }
      });
      return user?.timezone || 'UTC';
    } catch (error) {
      this.logger.warn(`Failed to fetch user timezone for ${userId}:`, error);
      return 'UTC';
    }
  }

  /**
   * Get appropriate timezone based on user type
   * - Account holders use their saved timezone preference
   * - Public users use the timezone selected during booking
   */
  async getEmailTimezone(user: any, fallbackTimezone?: string): Promise<string> {
    if (user?.id) {
      // Registered user - use their timezone preference
      return await this.getUserTimezone(user.id);
    } else {
      // Public user - use the timezone they selected during booking
      return fallbackTimezone || user?.timezone || 'UTC';
    }
  }

  /**
   * Enhanced timezone formatting with comprehensive information
   */
  formatDateWithTimezone(date: Date, timezone?: string): { 
    formattedDate: string, 
    formattedTime: string, 
    timezoneName: string,
    utcTime: string 
  } {
    const userTimezone = timezone || 'UTC';
    
    // Format date in user's timezone
    const options = { 
      timeZone: userTimezone,
      weekday: 'long' as const, 
      year: 'numeric' as const, 
      month: 'long' as const, 
      day: 'numeric' as const 
    };
    const formattedDate = date.toLocaleDateString('en-US', options);
    
    // Format time in user's timezone
    const timeOptions = { 
      timeZone: userTimezone,
      hour: 'numeric' as const, 
      minute: '2-digit' as const,
      timeZoneName: 'short' as const
    };
    const formattedTime = date.toLocaleTimeString('en-US', timeOptions);
    
    // Get timezone name
    const timezoneName = date.toLocaleDateString('en-US', { 
      timeZone: userTimezone, 
      timeZoneName: 'long' 
    }).split(', ').pop() || userTimezone;
    
    // UTC time for reference
    const utcTime = date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    
    return { formattedDate, formattedTime, timezoneName, utcTime };
  }

  /**
   * Enhanced email template with timezone-aware footer
   */
  private addTimezoneFooter(html: string, timezone: string, recipientType: 'account_holder' | 'public_user'): string {
    const timezoneFooter = `
      <div style="margin-top: 30px; padding: 20px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <h4 style="margin: 0 0 10px 0; color: #1e40af; font-size: 14px;">🌍 Timezone Information</h4>
        <p style="margin: 5px 0; font-size: 12px; color: #64748b;">
          <strong>All times displayed in:</strong> ${timezone}
        </p>
        <p style="margin: 5px 0; font-size: 12px; color: #64748b;">
          <strong>Source:</strong> ${recipientType === 'account_holder' 
            ? '⚙️ Your account timezone preference' 
            : '🌐 Timezone selected during booking'}
        </p>
        <p style="margin: 5px 0; font-size: 11px; color: #94a3b8;">
          To change your timezone preference, visit your account settings.
        </p>
      </div>
    `;
    
    // Insert before closing container div
    return html.replace('</div>\n        </div>\n      </body>', `${timezoneFooter}</div>\n        </div>\n      </body>`);
  }

  /**
   * Create timezone-aware booking confirmation email
   */
  async createBookingConfirmationEmail(booking: any): Promise<{
    html: string;
    text: string;
    timezone: string;
    recipientType: 'account_holder' | 'public_user';
  }> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const rescheduleUrl = `${frontendUrl}/public/booking/${booking.id}/reschedule?token=${this.generateBookingToken(booking.id)}`;
    const cancelUrl = `${frontendUrl}/public/booking/${booking.id}/cancel?token=${this.generateBookingToken(booking.id)}`;
    
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    
    // Get appropriate timezone
    const attendeeTimezone = await this.getEmailTimezone(
      booking.attendees[0], 
      booking.timezone || booking.attendees[0]?.timezone
    );
    
    const recipientType: 'account_holder' | 'public_user' = booking.attendees[0]?.userId ? 'account_holder' : 'public_user';
    
    const startTimeFormatted = this.formatDateWithTimezone(startTime, attendeeTimezone);
    const endTimeFormatted = this.formatDateWithTimezone(endTime, attendeeTimezone);
    
    const timeRange = `${startTime.toLocaleTimeString('en-US', { 
      timeZone: attendeeTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })} - ${endTime.toLocaleTimeString('en-US', { 
      timeZone: attendeeTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Booking Confirmed - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0; }
          .header { background-color: #10b981; color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #ffffff; }
          .meeting-details { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .timezone-info { background-color: #eff6ff; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 15px 0; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: 500; }
          .btn-primary { background-color: #3b82f6; color: white; }
          .btn-danger { background-color: #ef4444; color: white; }
          .footer { background-color: #f3f4f6; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
          .detail-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .detail-label { font-weight: 600; color: #374151; }
          .detail-value { color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 28px;">🎉 Booking Confirmed!</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your appointment has been successfully scheduled</p>
          </div>
          
          <div class="content">
            <p>Hello ${booking.attendees[0]?.name || 'there'},</p>
            <p>Great news! Your booking has been confirmed. Here are the details:</p>
            
            <div class="meeting-details">
              <h3 style="margin-top: 0; color: #10b981;">📅 Meeting Details</h3>
              <div class="detail-row">
                <span class="detail-label">Meeting:</span>
                <span class="detail-value">${booking.meetingType.name}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${startTimeFormatted.formattedDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Time:</span>
                <span class="detail-value">${timeRange}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Duration:</span>
                <span class="detail-value">${booking.meetingType.duration} minutes</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Host:</span>
                <span class="detail-value">${booking.host.firstName} ${booking.host.lastName}</span>
              </div>
            </div>

            <div class="timezone-info">
              <h4 style="margin-top: 0; color: #1e40af;">🌍 Timezone Information</h4>
              <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}</p>
              <p style="margin: 5px 0;"><strong>Your Timezone:</strong> ${startTimeFormatted.timezoneName}</p>
              <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}</p>
            </div>

            <div class="action-buttons">
              <a href="${rescheduleUrl}" class="button btn-primary">📅 Reschedule</a>
              <a href="${cancelUrl}" class="button btn-danger">❌ Cancel</a>
            </div>

            <p>If you have any questions, please contact ${booking.host.firstName} at ${booking.host.email}.</p>
            <p><strong>Booking Reference:</strong> ${booking.id}</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>Booking ID: ${booking.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const enhancedHtml = this.addTimezoneFooter(html, attendeeTimezone, recipientType);

    const text = `
      SchedulePro - Booking Confirmed!
      
      Hello ${booking.attendees[0]?.name || 'there'},
      
      Your booking has been confirmed! Here are the details:
      
      Meeting: ${booking.meetingType.name}
      Date: ${startTimeFormatted.formattedDate}
      Time: ${timeRange}
      Duration: ${booking.meetingType.duration} minutes
      Host: ${booking.host.firstName} ${booking.host.lastName}
      Booking ID: ${booking.id}
      
      TIMEZONE INFORMATION:
      Your Local Time: ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}
      Timezone: ${startTimeFormatted.timezoneName}
      UTC Reference: ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}
      Source: ${recipientType === 'account_holder' ? 'Account timezone preference' : 'Timezone selected during booking'}
      
      Actions:
      Reschedule: ${rescheduleUrl}
      Cancel: ${cancelUrl}
      
      If you have any questions, please contact ${booking.host.firstName} at ${booking.host.email}.
      
      Thank you,
      The SchedulePro Team
    `;

    return {
      html: enhancedHtml,
      text,
      timezone: attendeeTimezone,
      recipientType
    };
  }

  private generateBookingToken(bookingId: string): string {
    // This should match the existing implementation
    return Buffer.from(bookingId).toString('base64');
  }
}
