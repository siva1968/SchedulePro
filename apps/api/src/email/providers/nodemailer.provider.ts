import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailProvider, EmailOptions, EmailSendResult, EmailConfig } from '../interfaces/email-provider.interface';

@Injectable()
export class NodemailerProvider implements EmailProvider {
  private readonly logger = new Logger(NodemailerProvider.name);
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;

  constructor(private configService: ConfigService) {
    // Default config from environment
    this.initializeDefaultConfig();
    this.createTransporter();
  }

  private initializeDefaultConfig() {
    this.config = {
      provider: 'NODEMAILER' as any,
      fromEmail: this.configService.get('SMTP_FROM', 'noreply@schedulepro.com'),
      fromName: this.configService.get('SMTP_FROM_NAME', 'SchedulePro'),
      smtpHost: this.configService.get('SMTP_HOST', 'localhost'),
      smtpPort: parseInt(this.configService.get('SMTP_PORT', '1025')),
      smtpSecure: this.configService.get('SMTP_SECURE') === 'true',
      smtpUsername: this.configService.get('SMTP_USER'),
      smtpPassword: this.configService.get('SMTP_PASS'),
    };
  }

  private createTransporter() {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth: this.config.smtpUsername ? {
        user: this.config.smtpUsername,
        pass: this.config.smtpPassword,
      } : undefined,
    });
    this.logger.log('Nodemailer provider initialized');
  }

  setConfig(config: EmailConfig): void {
    this.config = config;
    this.createTransporter();
    this.logger.log('Nodemailer provider updated with new config');
  }

  async sendEmail(options: EmailOptions): Promise<EmailSendResult> {
    try {
      const result = await this.transporter.sendMail({
        from: `"${options.fromName || this.config.fromName}" <${options.from || this.config.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        replyTo: options.replyTo || this.config.replyToEmail,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
          encoding: att.encoding as any
        }))
      });

      this.logger.log(`Email sent successfully via Nodemailer to ${options.to}`);
      return {
        success: true,
        messageId: result.messageId,
        details: result
      };
    } catch (error) {
      this.logger.error(`Failed to send email via Nodemailer to ${options.to}:`, error);
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  async testConnection(): Promise<EmailSendResult> {
    try {
      await this.transporter.verify();
      return {
        success: true,
        messageId: 'test-connection-success'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!(this.config.smtpHost && 
             this.config.smtpPort && 
             this.config.fromEmail);
  }
}
