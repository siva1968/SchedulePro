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
}
