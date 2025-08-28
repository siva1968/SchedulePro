import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';
import { EmailProvider, EmailOptions, EmailSendResult, EmailConfig } from '../interfaces/email-provider.interface';

@Injectable()
export class SendGridProvider implements EmailProvider {
  private readonly logger = new Logger(SendGridProvider.name);
  private config: EmailConfig;

  constructor(private configService: ConfigService) {
    // Default config from environment
    this.initializeDefaultConfig();
  }

  private initializeDefaultConfig() {
    const apiKey = this.configService.get('SENDGRID_API_KEY');
    this.config = {
      provider: 'SENDGRID' as any,
      fromEmail: this.configService.get('SENDGRID_FROM_EMAIL', 'noreply@schedulepro.com'),
      fromName: this.configService.get('SENDGRID_FROM_NAME', 'SchedulePro'),
      sendgridApiKey: apiKey,
    };
    
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.logger.log('SendGrid provider initialized with default config');
    } else {
      this.logger.warn('SendGrid API key not found in environment');
    }
  }

  setConfig(config: EmailConfig): void {
    this.config = config;
    if (config.sendgridApiKey) {
      sgMail.setApiKey(config.sendgridApiKey);
      this.logger.log('SendGrid provider updated with new config');
    }
  }

  async sendEmail(options: EmailOptions): Promise<EmailSendResult> {
    if (!this.config.sendgridApiKey) {
      return {
        success: false,
        error: 'SendGrid API key not configured'
      };
    }

    const msg = {
      to: Array.isArray(options.to) ? options.to : [options.to],
      from: {
        email: options.from || this.config.fromEmail,
        name: options.fromName || this.config.fromName
      },
      replyTo: options.replyTo || this.config.replyToEmail,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map(att => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
        type: att.contentType,
        disposition: 'attachment'
      }))
    };

    try {
      const [response] = await sgMail.send(msg);
      this.logger.log(`Email sent successfully via SendGrid to ${options.to}`);
      return {
        success: true,
        messageId: response.headers['x-message-id'],
        details: response
      };
    } catch (error) {
      this.logger.error(`Failed to send email via SendGrid to ${options.to}:`, error);
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  async testConnection(): Promise<EmailSendResult> {
    if (!this.config.sendgridApiKey) {
      return {
        success: false,
        error: 'SendGrid API key not configured'
      };
    }

    try {
      // SendGrid doesn't have a simple test endpoint, so we'll validate the API key format
      if (!this.config.sendgridApiKey.startsWith('SG.')) {
        return {
          success: false,
          error: 'Invalid SendGrid API key format'
        };
      }

      // Test by sending to a test endpoint (this will validate the API key)
      const testMessage = {
        to: this.config.fromEmail,
        from: this.config.fromEmail,
        subject: 'SendGrid Test Connection',
        text: 'This is a test email to validate SendGrid configuration.',
        mail_settings: {
          sandbox_mode: {
            enable: true // This ensures the email is not actually sent
          }
        }
      };

      await sgMail.send(testMessage);
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
    return !!(this.config.sendgridApiKey && 
             this.config.fromEmail && 
             this.config.sendgridApiKey.startsWith('SG.'));
  }
}
