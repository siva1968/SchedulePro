import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { EmailProvider, EmailOptions, EmailSendResult, EmailConfig, EmailProviderType } from './interfaces/email-provider.interface';
import { NodemailerProvider } from './providers/nodemailer.provider';
import { SendGridProvider } from './providers/sendgrid.provider';
import { ZeptoProvider } from './providers/zepto.provider';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private providers: Map<EmailProviderType, EmailProvider> = new Map();
  private activeProvider: EmailProvider;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private nodemailerProvider: NodemailerProvider,
    private sendgridProvider: SendGridProvider,
    private zeptoProvider: ZeptoProvider,
  ) {
    this.providers.set(EmailProviderType.NODEMAILER, this.nodemailerProvider);
    this.providers.set(EmailProviderType.SENDGRID, this.sendgridProvider);
    this.providers.set(EmailProviderType.ZEPTO, this.zeptoProvider);
    
    // Initialize with default provider
    this.activeProvider = this.nodemailerProvider;
    this.initializeActiveProvider();
  }

  private async initializeActiveProvider() {
    try {
      const emailSettings = await this.getActiveEmailSettings();
      if (emailSettings) {
        await this.switchProvider(emailSettings);
      }
    } catch (error) {
      this.logger.warn('Failed to initialize email provider from database, using default', error);
    }
  }

  private async getActiveEmailSettings() {
    return await this.prisma.emailSettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async switchProvider(emailSettings: any): Promise<void> {
    const providerType = emailSettings.provider as EmailProviderType;
    const provider = this.providers.get(providerType);
    
    if (!provider) {
      throw new Error(`Email provider ${providerType} not found`);
    }

    const config: EmailConfig = {
      provider: providerType,
      fromEmail: emailSettings.fromEmail,
      fromName: emailSettings.fromName,
      replyToEmail: emailSettings.replyToEmail,
      smtpHost: emailSettings.smtpHost,
      smtpPort: emailSettings.smtpPort,
      smtpSecure: emailSettings.smtpSecure,
      smtpUsername: emailSettings.smtpUsername,
      smtpPassword: emailSettings.smtpPassword,
      sendgridApiKey: emailSettings.sendgridApiKey,
      zeptoApiKey: emailSettings.zeptoApiKey,
      zeptoApiUrl: emailSettings.zeptoApiUrl,
    };

    // Update provider config
    if ('setConfig' in provider) {
      (provider as any).setConfig(config);
    }

    this.activeProvider = provider;
    this.logger.log(`Switched to email provider: ${providerType}`);
  }

  async sendEmail(options: EmailOptions): Promise<EmailSendResult> {
    try {
      return await this.activeProvider.sendEmail(options);
    } catch (error) {
      this.logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  async testEmailProvider(providerId?: string): Promise<EmailSendResult> {
    let provider = this.activeProvider;
    
    if (providerId) {
      const emailSettings = await this.prisma.emailSettings.findUnique({
        where: { id: providerId }
      });
      
      if (emailSettings) {
        const tempProvider = this.providers.get(emailSettings.provider as EmailProviderType);
        if (tempProvider && 'setConfig' in tempProvider) {
          const config: EmailConfig = {
            provider: emailSettings.provider as EmailProviderType,
            fromEmail: emailSettings.fromEmail,
            fromName: emailSettings.fromName,
            replyToEmail: emailSettings.replyToEmail,
            smtpHost: emailSettings.smtpHost,
            smtpPort: emailSettings.smtpPort,
            smtpSecure: emailSettings.smtpSecure,
            smtpUsername: emailSettings.smtpUsername,
            smtpPassword: emailSettings.smtpPassword,
            sendgridApiKey: emailSettings.sendgridApiKey,
            zeptoApiKey: emailSettings.zeptoApiKey,
            zeptoApiUrl: emailSettings.zeptoApiUrl,
          };
          (tempProvider as any).setConfig(config);
          provider = tempProvider;
        }
      }
    }

    if ('testConnection' in provider) {
      return await (provider as any).testConnection();
    }

    return {
      success: false,
      error: 'Provider does not support test connection'
    };
  }

  async sendPasswordResetEmail(email: string, resetToken: string, userName: string): Promise<EmailSendResult> {
    const resetUrl = `${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/auth/reset-password?token=${resetToken}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .button { display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>SchedulePro</h1>
            <h2>Password Reset Request</h2>
          </div>
          <div class="content">
            <p>Hello ${userName || 'there'},</p>
            <p>We received a request to reset your password for your SchedulePro account.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #3b82f6;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
            <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>If you need help, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      SchedulePro - Password Reset Request
      
      Hello ${userName || 'there'},
      
      We received a request to reset your password for your SchedulePro account.
      
      To reset your password, please visit the following link:
      ${resetUrl}
      
      This link will expire in 1 hour for security reasons.
      
      If you didn't request this password reset, please ignore this email or contact support if you have concerns.
      
      Thank you,
      The SchedulePro Team
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Reset Your SchedulePro Password',
      text: textContent,
      html: html,
    });
  }

  async sendPasswordResetConfirmation(email: string, userName: string): Promise<EmailSendResult> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset Successful - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>SchedulePro</h1>
            <h2>Password Reset Successful</h2>
          </div>
          <div class="content">
            <p>Hello ${userName || 'there'},</p>
            <p>Your password has been successfully reset for your SchedulePro account.</p>
            <p>You can now log in to your account using your new password.</p>
            <p>If you didn't make this change, please contact our support team immediately.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>If you need help, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      SchedulePro - Password Reset Successful
      
      Hello ${userName || 'there'},
      
      Your password has been successfully reset for your SchedulePro account.
      You can now log in to your account using your new password.
      
      If you didn't make this change, please contact our support team immediately.
      
      Thank you,
      The SchedulePro Team
    `;

    return await this.sendEmail({
      to: email,
      subject: 'SchedulePro Password Reset Successful',
      text: textContent,
      html: html,
    });
  }

  // Booking-related email methods
  private formatDateWithTimezone(date: Date, timezone?: string): { 
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

  async sendBookingConfirmation(booking: any): Promise<EmailSendResult> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const rescheduleUrl = `${frontendUrl}/public/booking/${booking.id}/reschedule?token=${this.generateBookingToken(booking.id)}`;
    const cancelUrl = `${frontendUrl}/public/booking/${booking.id}/cancel?token=${this.generateBookingToken(booking.id)}`;
    
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    
    // Get attendee timezone or default to UTC
    const attendeeTimezone = booking.attendees[0]?.timezone || booking.timezone || 'UTC';
    
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
        <title>Booking Confirmation - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0; }
          .header { background-color: #3b82f6; color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #ffffff; }
          .booking-details { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #374151; }
          .detail-value { color: #1f2937; }
          .timezone-info { background-color: #eff6ff; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #3b82f6; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .btn-primary { background-color: #3b82f6; color: white; }
          .btn-secondary { background-color: #6b7280; color: white; }
          .btn-danger { background-color: #ef4444; color: white; }
          .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
          .warning { background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 SchedulePro</h1>
            <h2>Booking Confirmed!</h2>
          </div>
          <div class="content">
            <p>Hello ${booking.attendees[0]?.name || 'there'},</p>
            <p>Your booking has been confirmed! Here are the details:</p>
            
            <div class="booking-details">
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
              ${booking.meetingUrl ? `
              <div class="detail-row">
                <span class="detail-label">Meeting Link:</span>
                <span class="detail-value"><a href="${booking.meetingUrl}" style="color: #3b82f6; text-decoration: none;">${this.getMeetingProviderName(booking.meetingUrl)}</a></span>
              </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">Booking ID:</span>
                <span class="detail-value">${booking.id}</span>
              </div>
            </div>

            ${booking.meetingUrl ? `
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9; text-align: center;">
              <h4 style="margin-top: 0; color: #0c4a6e;">🎥 Join Your Meeting</h4>
              <p style="margin: 10px 0;">Click the button below to join your ${this.getMeetingProviderName(booking.meetingUrl)} meeting:</p>
              <a href="${booking.meetingUrl}" style="display: inline-block; background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0;">
                🎥 Join ${this.getMeetingProviderName(booking.meetingUrl)} Meeting
              </a>
              <p style="margin: 5px 0; font-size: 12px; color: #64748b;">Meeting Link: <a href="${booking.meetingUrl}" style="color: #0ea5e9;">${booking.meetingUrl}</a></p>
            </div>
            ` : ''}

            <div class="timezone-info">
              <h4 style="margin-top: 0; color: #1e40af;">🌍 Timezone Information:</h4>
              <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}</p>
              <p style="margin: 5px 0;"><strong>Timezone:</strong> ${startTimeFormatted.timezoneName}</p>
              <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}</p>
            </div>

            <div class="warning">
              <strong>📝 Need to make changes?</strong><br>
              Use the buttons below to reschedule or cancel this booking. The host will be automatically notified of any changes.
            </div>

            <div class="action-buttons">
              <a href="${rescheduleUrl}" class="button btn-primary">📅 Reschedule Booking</a>
              <a href="${cancelUrl}" class="button btn-danger">❌ Cancel Booking</a>
            </div>

            <p>If you have any questions, please don't hesitate to contact ${booking.host.firstName} at ${booking.host.email}.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>Booking ID: ${booking.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      SchedulePro - Booking Confirmed!
      
      Hello ${booking.attendees[0]?.name || 'there'},
      
      Your booking has been confirmed! Here are the details:
      
      Meeting: ${booking.meetingType.name}
      Date: ${startTimeFormatted.formattedDate}
      Time: ${timeRange}
      Duration: ${booking.meetingType.duration} minutes
      Host: ${booking.host.firstName} ${booking.host.lastName}
      ${booking.meetingUrl ? `Meeting Link: ${booking.meetingUrl} (${this.getMeetingProviderName(booking.meetingUrl)})` : ''}
      Booking ID: ${booking.id}
      
      ${booking.meetingUrl ? `
      JOIN YOUR MEETING:
      Click this link to join your ${this.getMeetingProviderName(booking.meetingUrl)} meeting:
      ${booking.meetingUrl}
      ` : ''}
      
      TIMEZONE INFORMATION:
      Your Local Time: ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}
      Timezone: ${startTimeFormatted.timezoneName}
      UTC Reference: ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}
      
      Need to make changes?
      Reschedule: ${rescheduleUrl}
      Cancel: ${cancelUrl}
      
      The host will be automatically notified of any changes.
      
      If you have any questions, please contact ${booking.host.firstName} at ${booking.host.email}.
      
      Thank you,
      The SchedulePro Team
    `;

    return await this.sendEmail({
      to: booking.attendees[0]?.email,
      subject: `Booking Confirmed: ${booking.meetingType.name} on ${startTimeFormatted.formattedDate}`,
      text: textContent,
      html: html,
    });
  }

  async sendBookingNotificationToHost(booking: any): Promise<EmailSendResult> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const manageUrl = `${frontendUrl}/dashboard/bookings/${booking.id}`;
    
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    
    // Get host timezone or default to UTC
    const hostTimezone = booking.host.timezone || 'UTC';
    
    const startTimeFormatted = this.formatDateWithTimezone(startTime, hostTimezone);
    const endTimeFormatted = this.formatDateWithTimezone(endTime, hostTimezone);
    
    const timeRange = `${startTime.toLocaleTimeString('en-US', { 
      timeZone: hostTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })} - ${endTime.toLocaleTimeString('en-US', { 
      timeZone: hostTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Booking - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0; }
          .header { background-color: #10b981; color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #ffffff; }
          .booking-details { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #374151; }
          .detail-value { color: #1f2937; }
          .timezone-info { background-color: #eff6ff; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #3b82f6; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: bold; background-color: #10b981; color: white; }
          .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 SchedulePro</h1>
            <h2>New Booking Received!</h2>
          </div>
          <div class="content">
            <p>Hello ${booking.host.firstName},</p>
            <p>You have received a new booking! Here are the details:</p>
            
            <div class="booking-details">
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
                <span class="detail-label">Attendee:</span>
                <span class="detail-value">${booking.attendees[0]?.name} (${booking.attendees[0]?.email})</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Booking ID:</span>
                <span class="detail-value">${booking.id}</span>
              </div>
            </div>

            <div class="timezone-info">
              <h4 style="margin-top: 0; color: #1e40af;">🌍 Timezone Information:</h4>
              <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}</p>
              <p style="margin: 5px 0;"><strong>Your Timezone:</strong> ${startTimeFormatted.timezoneName}</p>
              <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}</p>
            </div>

            <div class="action-buttons">
              <a href="${manageUrl}" class="button">📋 Manage Booking</a>
            </div>

            <p>The attendee will receive automatic notifications if you make any changes to this booking.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>Booking ID: ${booking.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      SchedulePro - New Booking Received!
      
      Hello ${booking.host.firstName},
      
      You have received a new booking! Here are the details:
      
      Meeting: ${booking.meetingType.name}
      Date: ${startTimeFormatted.formattedDate}
      Time: ${timeRange}
      Duration: ${booking.meetingType.duration} minutes
      Attendee: ${booking.attendees[0]?.name} (${booking.attendees[0]?.email})
      Booking ID: ${booking.id}
      
      TIMEZONE INFORMATION:
      Your Local Time: ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}
      Your Timezone: ${startTimeFormatted.timezoneName}
      UTC Reference: ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}
      
      Manage this booking: ${manageUrl}
      
      The attendee will receive automatic notifications if you make any changes to this booking.
      
      Thank you,
      The SchedulePro Team
    `;

    return await this.sendEmail({
      to: booking.host.email,
      subject: `New Booking: ${booking.meetingType.name} on ${startTimeFormatted.formattedDate}`,
      text: textContent,
      html: html,
    });
  }

  async sendBookingCancellation(booking: any, cancelledBy: 'attendee' | 'host', reason?: string): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = [];
    const startTime = new Date(booking.startTime);
    
    // Get appropriate timezone based on who the email is for
    const attendeeTimezone = booking.attendees[0]?.timezone || booking.timezone || 'UTC';
    const hostTimezone = booking.host.timezone || 'UTC';
    
    const attendeeTimeFormatted = this.formatDateWithTimezone(startTime, attendeeTimezone);
    const hostTimeFormatted = this.formatDateWithTimezone(startTime, hostTimezone);

    // Email to attendee
    if (cancelledBy === 'host') {
      const attendeeHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Booking Cancelled - SchedulePro</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 0; }
            .header { background-color: #ef4444; color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #ffffff; }
            .booking-details { background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
            .timezone-info { background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #6b7280; }
            .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 SchedulePro</h1>
              <h2>Booking Cancelled</h2>
            </div>
            <div class="content">
              <p>Hello ${booking.attendees[0]?.name || 'there'},</p>
              <p>Unfortunately, your booking has been cancelled by the host.</p>
              
              <div class="booking-details">
                <h3>Cancelled Booking Details:</h3>
                <p><strong>Meeting:</strong> ${booking.meetingType.name}</p>
                <p><strong>Date:</strong> ${attendeeTimeFormatted.formattedDate}</p>
                <p><strong>Time:</strong> ${attendeeTimeFormatted.formattedTime}</p>
                <p><strong>Host:</strong> ${booking.host.firstName} ${booking.host.lastName}</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              </div>

              <div class="timezone-info">
                <h4 style="margin-top: 0; color: #374151;">🌍 Cancelled Time Details:</h4>
                <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${attendeeTimeFormatted.formattedTime}</p>
                <p style="margin: 5px 0;"><strong>Your Timezone:</strong> ${attendeeTimeFormatted.timezoneName}</p>
                <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${attendeeTimeFormatted.utcTime}</p>
              </div>

              <p>If you need to schedule a new appointment, please visit the booking page again.</p>
              <p>For any questions, please contact ${booking.host.firstName} at ${booking.host.email}.</p>
            </div>
            <div class="footer">
              <p>This email was sent by SchedulePro</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const attendeeTextContent = `
        SchedulePro - Booking Cancelled
        
        Hello ${booking.attendees[0]?.name || 'there'},
        
        Unfortunately, your booking has been cancelled by the host.
        
        Cancelled Booking Details:
        Meeting: ${booking.meetingType.name}
        Date: ${attendeeTimeFormatted.formattedDate}
        Time: ${attendeeTimeFormatted.formattedTime}
        Host: ${booking.host.firstName} ${booking.host.lastName}
        ${reason ? `Reason: ${reason}` : ''}
        
        TIMEZONE INFORMATION:
        Your Local Time: ${attendeeTimeFormatted.formattedTime}
        Your Timezone: ${attendeeTimeFormatted.timezoneName}
        UTC Reference: ${attendeeTimeFormatted.utcTime}
        
        If you need to schedule a new appointment, please visit the booking page again.
        For any questions, please contact ${booking.host.firstName} at ${booking.host.email}.
        
        Thank you,
        The SchedulePro Team
      `;

      results.push(await this.sendEmail({
        to: booking.attendees[0]?.email,
        subject: `Booking Cancelled: ${booking.meetingType.name} on ${attendeeTimeFormatted.formattedDate}`,
        text: attendeeTextContent,
        html: attendeeHtml,
      }));
    }

    // Email to host
    if (cancelledBy === 'attendee') {
      const hostHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Booking Cancelled - SchedulePro</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 0; }
            .header { background-color: #f59e0b; color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #ffffff; }
            .booking-details { background-color: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .timezone-info { background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #6b7280; }
            .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 SchedulePro</h1>
              <h2>Booking Cancelled by Attendee</h2>
            </div>
            <div class="content">
              <p>Hello ${booking.host.firstName},</p>
              <p>A booking has been cancelled by the attendee.</p>
              
              <div class="booking-details">
                <h3>Cancelled Booking Details:</h3>
                <p><strong>Meeting:</strong> ${booking.meetingType.name}</p>
                <p><strong>Date:</strong> ${hostTimeFormatted.formattedDate}</p>
                <p><strong>Time:</strong> ${hostTimeFormatted.formattedTime}</p>
                <p><strong>Attendee:</strong> ${booking.attendees[0]?.name} (${booking.attendees[0]?.email})</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              </div>

              <div class="timezone-info">
                <h4 style="margin-top: 0; color: #374151;">🌍 Cancelled Time Details:</h4>
                <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${hostTimeFormatted.formattedTime}</p>
                <p style="margin: 5px 0;"><strong>Your Timezone:</strong> ${hostTimeFormatted.timezoneName}</p>
                <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${hostTimeFormatted.utcTime}</p>
              </div>

              <p>Your calendar has been updated to reflect this cancellation.</p>
            </div>
            <div class="footer">
              <p>This email was sent by SchedulePro</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const hostTextContent = `
        SchedulePro - Booking Cancelled by Attendee
        
        Hello ${booking.host.firstName},
        
        A booking has been cancelled by the attendee.
        
        Cancelled Booking Details:
        Meeting: ${booking.meetingType.name}
        Date: ${hostTimeFormatted.formattedDate}
        Time: ${hostTimeFormatted.formattedTime}
        Attendee: ${booking.attendees[0]?.name} (${booking.attendees[0]?.email})
        ${reason ? `Reason: ${reason}` : ''}
        
        TIMEZONE INFORMATION:
        Your Local Time: ${hostTimeFormatted.formattedTime}
        Your Timezone: ${hostTimeFormatted.timezoneName}
        UTC Reference: ${hostTimeFormatted.utcTime}
        
        Your calendar has been updated to reflect this cancellation.
        
        Thank you,
        The SchedulePro Team
      `;

      results.push(await this.sendEmail({
        to: booking.host.email,
        subject: `Booking Cancelled: ${booking.meetingType.name} on ${hostTimeFormatted.formattedDate}`,
        text: hostTextContent,
        html: hostHtml,
      }));
    }

    return results;
  }

  async sendBookingReschedule(booking: any, oldStartTime: Date, rescheduledBy: 'attendee' | 'host'): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = [];
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const rescheduleUrl = `${frontendUrl}/public/booking/${booking.id}/reschedule?token=${this.generateBookingToken(booking.id)}`;
    const cancelUrl = `${frontendUrl}/public/booking/${booking.id}/cancel?token=${this.generateBookingToken(booking.id)}`;
    
    const newStartTime = new Date(booking.startTime);
    const newEndTime = new Date(booking.endTime);
    const oldEndTime = new Date(oldStartTime.getTime() + booking.meetingType.duration * 60000);
    
    // Get appropriate timezones
    const attendeeTimezone = booking.attendees[0]?.timezone || booking.timezone || 'UTC';
    const hostTimezone = booking.host.timezone || 'UTC';

    // Always send email to attendee (confirmation of reschedule)
    const oldTimeFormattedAttendee = this.formatDateWithTimezone(oldStartTime, attendeeTimezone);
    const oldEndTimeFormattedAttendee = this.formatDateWithTimezone(oldEndTime, attendeeTimezone);
    const newTimeFormattedAttendee = this.formatDateWithTimezone(newStartTime, attendeeTimezone);
    const newEndTimeFormattedAttendee = this.formatDateWithTimezone(newEndTime, attendeeTimezone);
    
    const oldTimeRangeAttendee = `${oldStartTime.toLocaleTimeString('en-US', { 
      timeZone: attendeeTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })} - ${oldEndTime.toLocaleTimeString('en-US', { 
      timeZone: attendeeTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })}`;
    
    const newTimeRangeAttendee = `${newStartTime.toLocaleTimeString('en-US', { 
      timeZone: attendeeTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })} - ${newEndTime.toLocaleTimeString('en-US', { 
      timeZone: attendeeTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })}`;

    const attendeeEmailTitle = rescheduledBy === 'host' ? 'Booking Rescheduled by Host' : 'Booking Rescheduled Successfully';
    const attendeeEmailMessage = rescheduledBy === 'host' 
      ? `Your booking has been rescheduled by ${booking.host.firstName} ${booking.host.lastName}.`
      : `Your booking has been successfully rescheduled.`;

    const attendeeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Booking Rescheduled - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0; }
          .header { background-color: #3b82f6; color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #ffffff; }
          .time-change { background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
          .timezone-info { background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #6b7280; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .btn-primary { background-color: #3b82f6; color: white; }
          .btn-danger { background-color: #ef4444; color: white; }
          .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 SchedulePro</h1>
            <h2>${attendeeEmailTitle}</h2>
          </div>
          <div class="content">
            <p>Hello ${booking.attendees[0]?.name || 'there'},</p>
            <p>${attendeeEmailMessage}</p>
            
            <div class="time-change">
              <h3>📅 Time Change:</h3>
              <p><strong>Previous Time:</strong><br>
                 ${oldTimeFormattedAttendee.formattedDate} at ${oldTimeRangeAttendee}</p>
              <p><strong>New Time:</strong><br>
                 ${newTimeFormattedAttendee.formattedDate} at ${newTimeRangeAttendee}</p>
              <p><strong>Meeting:</strong> ${booking.meetingType.name}</p>
              <p><strong>Duration:</strong> ${booking.meetingType.duration} minutes</p>
            </div>

            <div class="timezone-info">
              <h4 style="margin-top: 0; color: #374151;">🌍 New Time Details:</h4>
              <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${newTimeFormattedAttendee.formattedTime} - ${newEndTimeFormattedAttendee.formattedTime}</p>
              <p style="margin: 5px 0;"><strong>Your Timezone:</strong> ${newTimeFormattedAttendee.timezoneName}</p>
              <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${newTimeFormattedAttendee.utcTime} - ${newEndTimeFormattedAttendee.utcTime}</p>
            </div>

            <div class="action-buttons">
              <a href="${rescheduleUrl}" class="button btn-primary">📅 Reschedule Again</a>
              <a href="${cancelUrl}" class="button btn-danger">❌ Cancel Booking</a>
            </div>

            <p>If you have any questions about this change, please contact ${booking.host.firstName} at ${booking.host.email}.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const attendeeTextContent = `
      SchedulePro - ${attendeeEmailTitle}
      
      Hello ${booking.attendees[0]?.name || 'there'},
      
      ${attendeeEmailMessage}
      
      TIME CHANGE:
      Previous Time: ${oldTimeFormattedAttendee.formattedDate} at ${oldTimeRangeAttendee}
      New Time: ${newTimeFormattedAttendee.formattedDate} at ${newTimeRangeAttendee}
      Meeting: ${booking.meetingType.name}
      Duration: ${booking.meetingType.duration} minutes
      
      NEW TIME DETAILS:
      Your Local Time: ${newTimeFormattedAttendee.formattedTime} - ${newEndTimeFormattedAttendee.formattedTime}
      Your Timezone: ${newTimeFormattedAttendee.timezoneName}
      UTC Reference: ${newTimeFormattedAttendee.utcTime} - ${newEndTimeFormattedAttendee.utcTime}
      
      Actions:
      Reschedule Again: ${rescheduleUrl}
      Cancel Booking: ${cancelUrl}
      
      If you have any questions about this change, please contact ${booking.host.firstName} at ${booking.host.email}.
      
      Thank you,
      The SchedulePro Team
    `;

    results.push(await this.sendEmail({
      to: booking.attendees[0]?.email,
      subject: `Booking Rescheduled: ${booking.meetingType.name} - New Time`,
      text: attendeeTextContent,
      html: attendeeHtml,
    }));

    // Email to host (notification of reschedule)
    if (rescheduledBy === 'attendee') {
      const manageUrl = `${frontendUrl}/dashboard/bookings/${booking.id}`;
      
      const oldTimeFormattedHost = this.formatDateWithTimezone(oldStartTime, hostTimezone);
      const oldEndTimeFormattedHost = this.formatDateWithTimezone(oldEndTime, hostTimezone);
      const newTimeFormattedHost = this.formatDateWithTimezone(newStartTime, hostTimezone);
      const newEndTimeFormattedHost = this.formatDateWithTimezone(newEndTime, hostTimezone);
      
      const oldTimeRangeHost = `${oldStartTime.toLocaleTimeString('en-US', { 
        timeZone: hostTimezone,
        hour: 'numeric', 
        minute: '2-digit' 
      })} - ${oldEndTime.toLocaleTimeString('en-US', { 
        timeZone: hostTimezone,
        hour: 'numeric', 
        minute: '2-digit' 
      })}`;
      
      const newTimeRangeHost = `${newStartTime.toLocaleTimeString('en-US', { 
        timeZone: hostTimezone,
        hour: 'numeric', 
        minute: '2-digit' 
      })} - ${newEndTime.toLocaleTimeString('en-US', { 
        timeZone: hostTimezone,
        hour: 'numeric', 
        minute: '2-digit' 
      })}`;
      
      const hostHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Booking Rescheduled - SchedulePro</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 0; }
            .header { background-color: #10b981; color: white; padding: 30px 20px; text-align: center; }
            .content { padding: 30px 20px; background-color: #ffffff; }
            .time-change { background-color: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .timezone-info { background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #6b7280; }
            .action-buttons { text-align: center; margin: 30px 0; }
            .button { display: inline-block; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; background-color: #10b981; color: white; }
            .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 SchedulePro</h1>
              <h2>Booking Rescheduled by Attendee</h2>
            </div>
            <div class="content">
              <p>Hello ${booking.host.firstName},</p>
              <p>A booking has been rescheduled by ${booking.attendees[0]?.name}.</p>
              
              <div class="time-change">
                <h3>📅 Time Change:</h3>
                <p><strong>Previous Time:</strong><br>
                   ${oldTimeFormattedHost.formattedDate} at ${oldTimeRangeHost}</p>
                <p><strong>New Time:</strong><br>
                   ${newTimeFormattedHost.formattedDate} at ${newTimeRangeHost}</p>
                <p><strong>Meeting:</strong> ${booking.meetingType.name}</p>
                <p><strong>Attendee:</strong> ${booking.attendees[0]?.name} (${booking.attendees[0]?.email})</p>
              </div>

              <div class="timezone-info">
                <h4 style="margin-top: 0; color: #374151;">🌍 New Time Details:</h4>
                <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${newTimeFormattedHost.formattedTime} - ${newEndTimeFormattedHost.formattedTime}</p>
                <p style="margin: 5px 0;"><strong>Your Timezone:</strong> ${newTimeFormattedHost.timezoneName}</p>
                <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${newTimeFormattedHost.utcTime} - ${newEndTimeFormattedHost.utcTime}</p>
              </div>

              <div class="action-buttons">
                <a href="${manageUrl}" class="button">📋 Manage Booking</a>
              </div>

              <p>Your calendar has been updated to reflect this change.</p>
            </div>
            <div class="footer">
              <p>This email was sent by SchedulePro</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const hostTextContent = `
        SchedulePro - Booking Rescheduled by Attendee
        
        Hello ${booking.host.firstName},
        
        A booking has been rescheduled by ${booking.attendees[0]?.name}.
        
        TIME CHANGE:
        Previous Time: ${oldTimeFormattedHost.formattedDate} at ${oldTimeRangeHost}
        New Time: ${newTimeFormattedHost.formattedDate} at ${newTimeRangeHost}
        Meeting: ${booking.meetingType.name}
        Attendee: ${booking.attendees[0]?.name} (${booking.attendees[0]?.email})
        
        NEW TIME DETAILS:
        Your Local Time: ${newTimeFormattedHost.formattedTime} - ${newEndTimeFormattedHost.formattedTime}
        Your Timezone: ${newTimeFormattedHost.timezoneName}
        UTC Reference: ${newTimeFormattedHost.utcTime} - ${newEndTimeFormattedHost.utcTime}
        
        Manage this booking: ${manageUrl}
        
        Your calendar has been updated to reflect this change.
        
        Thank you,
        The SchedulePro Team
      `;

      results.push(await this.sendEmail({
        to: booking.host.email,
        subject: `Booking Rescheduled: ${booking.meetingType.name} - New Time`,
        text: hostTextContent,
        html: hostHtml,
      }));
    }

    return results;
  }

  private generateBookingToken(bookingId: string): string {
    // In production, this should be a secure JWT token with expiration
    return Buffer.from(`${bookingId}:${Date.now()}`).toString('base64');
  }

  private getMeetingProviderName(meetingUrl: string): string {
    if (meetingUrl.includes('meet.google.com')) {
      return 'Google Meet';
    } else if (meetingUrl.includes('teams.microsoft.com')) {
      return 'Microsoft Teams';
    } else if (meetingUrl.includes('zoom.us')) {
      return 'Zoom';
    } else if (meetingUrl.includes('webex.com')) {
      return 'Webex';
    } else {
      return 'Online Meeting';
    }
  }

  // Booking approval workflow email methods
  async sendBookingPendingConfirmation(booking: any): Promise<EmailSendResult> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const rescheduleUrl = `${frontendUrl}/public/booking/${booking.id}/reschedule?token=${this.generateBookingToken(booking.id)}`;
    const cancelUrl = `${frontendUrl}/public/booking/${booking.id}/cancel?token=${this.generateBookingToken(booking.id)}`;
    
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    
    // Get attendee timezone or default to UTC
    const attendeeTimezone = booking.attendees[0]?.timezone || booking.timezone || 'UTC';
    
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
        <title>Booking Pending Approval - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0; }
          .header { background-color: #f59e0b; color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #ffffff; }
          .booking-details { background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #374151; }
          .detail-value { color: #1f2937; }
          .timezone-info { background-color: #eff6ff; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #3b82f6; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .btn-primary { background-color: #3b82f6; color: white; }
          .btn-danger { background-color: #ef4444; color: white; }
          .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
          .status-badge { background-color: #f59e0b; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 SchedulePro</h1>
            <h2>Booking Submitted - Pending Approval</h2>
          </div>
          <div class="content">
            <p>Hello ${booking.attendees[0]?.name || 'there'},</p>
            <p>Your booking request has been submitted and is pending approval from ${booking.host.firstName}!</p>
            
            <div class="status-badge">⏳ PENDING APPROVAL</div>
            
            <div class="booking-details">
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
              <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">Pending Approval</span>
              </div>
            </div>

            <div class="timezone-info">
              <h4 style="margin-top: 0; color: #1e40af;">🌍 Timezone Information:</h4>
              <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}</p>
              <p style="margin: 5px 0;"><strong>Timezone:</strong> ${startTimeFormatted.timezoneName}</p>
              <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}</p>
            </div>

            <p><strong>What happens next?</strong></p>
            <ul>
              <li>${booking.host.firstName} will review your booking request</li>
              <li>You'll receive an email notification once approved/declined</li>
              <li>If approved, you'll receive meeting details and calendar invites</li>
            </ul>

            <div class="action-buttons">
              <a href="${rescheduleUrl}" class="button btn-primary">📅 Reschedule Request</a>
              <a href="${cancelUrl}" class="button btn-danger">❌ Cancel Request</a>
            </div>

            <p>If you have any questions, please contact ${booking.host.firstName} at ${booking.host.email}.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>Booking ID: ${booking.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      SchedulePro - Booking Pending Approval
      
      Hello ${booking.attendees[0]?.name || 'there'},
      
      Your booking request has been submitted and is pending approval from ${booking.host.firstName}!
      
      STATUS: PENDING APPROVAL
      
      Meeting: ${booking.meetingType.name}
      Date: ${startTimeFormatted.formattedDate}
      Time: ${timeRange}
      Duration: ${booking.meetingType.duration} minutes
      Host: ${booking.host.firstName} ${booking.host.lastName}
      
      TIMEZONE INFORMATION:
      Your Local Time: ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}
      Timezone: ${startTimeFormatted.timezoneName}
      UTC Reference: ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}
      
      What happens next?
      - ${booking.host.firstName} will review your booking request
      - You'll receive an email notification once approved/declined
      - If approved, you'll receive meeting details and calendar invites
      
      Reschedule: ${rescheduleUrl}
      Cancel: ${cancelUrl}
      
      If you have any questions, please contact ${booking.host.firstName} at ${booking.host.email}.
      
      Thank you,
      The SchedulePro Team
    `;

    return await this.sendEmail({
      to: booking.attendees[0]?.email,
      subject: `Booking Request Submitted: ${booking.meetingType.name} - Pending Approval`,
      text: textContent,
      html: html,
    });
  }

  async sendBookingApprovalRequest(booking: any): Promise<EmailSendResult> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const approveUrl = `${frontendUrl}/dashboard/bookings/${booking.id}/approve`;
    const declineUrl = `${frontendUrl}/dashboard/bookings/${booking.id}/decline`;
    const manageUrl = `${frontendUrl}/dashboard/bookings/${booking.id}`;
    
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    
    // Get host timezone
    const hostTimezone = booking.host.timezone || 'UTC';
    
    const startTimeFormatted = this.formatDateWithTimezone(startTime, hostTimezone);
    const endTimeFormatted = this.formatDateWithTimezone(endTime, hostTimezone);
    
    const timeRange = `${startTime.toLocaleTimeString('en-US', { 
      timeZone: hostTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })} - ${endTime.toLocaleTimeString('en-US', { 
      timeZone: hostTimezone,
      hour: 'numeric', 
      minute: '2-digit' 
    })}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Booking Approval Required - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0; }
          .header { background-color: #f59e0b; color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #ffffff; }
          .booking-details { background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #374151; }
          .detail-value { color: #1f2937; }
          .timezone-info { background-color: #eff6ff; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #3b82f6; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 15px 30px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; }
          .btn-approve { background-color: #10b981; color: white; }
          .btn-decline { background-color: #ef4444; color: white; }
          .btn-manage { background-color: #6b7280; color: white; }
          .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
          .urgent { background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ef4444; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 SchedulePro</h1>
            <h2>New Booking Approval Required</h2>
          </div>
          <div class="content">
            <p>Hello ${booking.host.firstName},</p>
            <p>You have a new booking request that requires your approval!</p>
            
            <div class="urgent">
              <strong>⚡ Action Required:</strong> Please review and approve/decline this booking request.
            </div>
            
            <div class="booking-details">
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
                <span class="detail-label">Attendee:</span>
                <span class="detail-value">${booking.attendees[0]?.name} (${booking.attendees[0]?.email})</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">Pending Your Approval</span>
              </div>
            </div>

            <div class="timezone-info">
              <h4 style="margin-top: 0; color: #1e40af;">🌍 Timezone Information:</h4>
              <p style="margin: 5px 0;"><strong>Your Local Time:</strong> ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}</p>
              <p style="margin: 5px 0;"><strong>Timezone:</strong> ${startTimeFormatted.timezoneName}</p>
              <p style="margin: 5px 0; font-size: 12px; color: #6b7280;"><strong>UTC Reference:</strong> ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}</p>
            </div>

            <div class="action-buttons">
              <a href="${approveUrl}" class="button btn-approve">✅ Approve Booking</a>
              <a href="${declineUrl}" class="button btn-decline">❌ Decline Booking</a>
            </div>
            
            <div class="action-buttons">
              <a href="${manageUrl}" class="button btn-manage">📋 View Details</a>
            </div>

            <p>The attendee is waiting for your response. They will be automatically notified once you approve or decline this request.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>Booking ID: ${booking.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      SchedulePro - New Booking Approval Required
      
      Hello ${booking.host.firstName},
      
      You have a new booking request that requires your approval!
      
      ACTION REQUIRED: Please review and approve/decline this booking request.
      
      Meeting: ${booking.meetingType.name}
      Date: ${startTimeFormatted.formattedDate}
      Time: ${timeRange}
      Duration: ${booking.meetingType.duration} minutes
      Attendee: ${booking.attendees[0]?.name} (${booking.attendees[0]?.email})
      Status: Pending Your Approval
      
      TIMEZONE INFORMATION:
      Your Local Time: ${startTimeFormatted.formattedTime} - ${endTimeFormatted.formattedTime}
      Timezone: ${startTimeFormatted.timezoneName}
      UTC Reference: ${startTimeFormatted.utcTime} - ${endTimeFormatted.utcTime}
      
      Actions:
      Approve: ${approveUrl}
      Decline: ${declineUrl}
      View Details: ${manageUrl}
      
      The attendee is waiting for your response. They will be automatically notified once you approve or decline this request.
      
      Thank you,
      The SchedulePro Team
    `;

    return await this.sendEmail({
      to: booking.host.email,
      subject: `⚡ Booking Approval Required: ${booking.meetingType.name} on ${startTimeFormatted.formattedDate}`,
      text: textContent,
      html: html,
    });
  }

  async sendBookingApprovalConfirmation(booking: any, meetingUrl?: string): Promise<EmailSendResult> {
    // Use the existing sendBookingConfirmation but with approval context
    return this.sendBookingConfirmation(booking);
  }

  async sendBookingConfirmedNotificationToHost(booking: any): Promise<EmailSendResult> {
    // Use the existing sendBookingNotificationToHost
    return this.sendBookingNotificationToHost(booking);
  }

  async sendBookingDeclineNotification(booking: any, reason?: string): Promise<EmailSendResult> {
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const rebookUrl = `${frontendUrl}/book/${booking.meetingType.hostId}/${booking.meetingType.id}`;
    
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    
    // Get attendee timezone or default to UTC
    const attendeeTimezone = booking.attendees[0]?.timezone || booking.timezone || 'UTC';
    
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
        <title>Booking Request Declined - SchedulePro</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 0; }
          .header { background-color: #ef4444; color: white; padding: 30px 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #ffffff; }
          .booking-details { background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #374151; }
          .detail-value { color: #1f2937; }
          .reason-box { background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }
          .action-buttons { text-align: center; margin: 30px 0; }
          .button { display: inline-block; padding: 12px 24px; margin: 0 10px; text-decoration: none; border-radius: 6px; font-weight: bold; }
          .btn-primary { background-color: #3b82f6; color: white; }
          .footer { text-align: center; padding: 20px; background-color: #f3f4f6; color: #666; font-size: 14px; }
          .status-badge { background-color: #ef4444; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📅 SchedulePro</h1>
            <h2>Booking Request Declined</h2>
          </div>
          <div class="content">
            <p>Hello ${booking.attendees[0]?.name || 'there'},</p>
            <p>We're sorry, but ${booking.host.firstName} was unable to approve your booking request.</p>
            
            <div class="status-badge">❌ DECLINED</div>
            
            <div class="booking-details">
              <div class="detail-row">
                <span class="detail-label">Meeting:</span>
                <span class="detail-value">${booking.meetingType.name}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Requested Date:</span>
                <span class="detail-value">${startTimeFormatted.formattedDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Requested Time:</span>
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
              <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">❌ Declined</span>
              </div>
            </div>

            ${reason ? `
            <div class="reason-box">
              <h4 style="margin-top: 0; color: #92400e;">📝 Reason for Decline:</h4>
              <p style="margin: 5px 0;">${reason}</p>
            </div>
            ` : ''}

            <p><strong>What's next?</strong></p>
            <ul>
              <li>You can book a different time slot that works better</li>
              <li>Contact ${booking.host.firstName} directly for alternative arrangements</li>
              <li>Check for other available meeting times</li>
            </ul>

            <div class="action-buttons">
              <a href="${rebookUrl}" class="button btn-primary">📅 Book New Time</a>
            </div>

            <p>If you have any questions, please contact ${booking.host.firstName} at ${booking.host.email}.</p>
          </div>
          <div class="footer">
            <p>This email was sent by SchedulePro</p>
            <p>Booking ID: ${booking.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      SchedulePro - Booking Request Declined
      
      Hello ${booking.attendees[0]?.name || 'there'},
      
      We're sorry, but ${booking.host.firstName} was unable to approve your booking request.
      
      STATUS: ❌ DECLINED
      
      Meeting: ${booking.meetingType.name}
      Requested Date: ${startTimeFormatted.formattedDate}
      Requested Time: ${timeRange}
      Duration: ${booking.meetingType.duration} minutes
      Host: ${booking.host.firstName} ${booking.host.lastName}
      
      ${reason ? `
      REASON FOR DECLINE: ${reason}
      ` : ''}
      
      What's next?
      - You can book a different time slot that works better
      - Contact ${booking.host.firstName} directly for alternative arrangements
      - Check for other available meeting times
      
      Book New Time: ${rebookUrl}
      
      If you have any questions, please contact ${booking.host.firstName} at ${booking.host.email}.
      
      Thank you,
      The SchedulePro Team
    `;

    return await this.sendEmail({
      to: booking.attendees[0]?.email,
      subject: `Booking Request Declined: ${booking.meetingType.name} on ${startTimeFormatted.formattedDate}`,
      text: textContent,
      html: html,
    });
  }
}
