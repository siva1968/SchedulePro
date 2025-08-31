import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

export interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

@Injectable()
export class SendGridProvider {
  private readonly logger = new Logger(SendGridProvider.name);
  private config: SendGridConfig | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    
    this.config = {
      apiKey: apiKey || '',
      fromEmail: this.configService.get('SENDGRID_FROM_EMAIL', 'noreply@schedulepro.com'),
      fromName: this.configService.get('SENDGRID_FROM_NAME', 'SchedulePro'),
    };
    
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.logger.log('SendGrid provider initialized successfully');
    } else {
      this.logger.warn('SendGrid API key not provided - email functionality will be limited');
    }
  }

  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.config?.apiKey) {
        this.logger.warn('No SendGrid API key configured - email not sent');
        return { 
          success: false, 
          error: 'SendGrid API key not configured' 
        };
      }

      const message = {
        to: options.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName,
        },
        subject: options.subject,
        text: options.text || '',
        html: options.html || options.text || '',
        trackingSettings: {
          clickTracking: {
            enable: true,
          },
          openTracking: {
            enable: true,
          },
        },
        mailSettings: {
          sandboxMode: {
            enable: process.env.NODE_ENV === 'test',
          },
        },
      };

      const response = await sgMail.send(message);
      
      this.logger.log(`Email sent successfully to ${options.to}`);
      
      return { 
        success: true, 
        messageId: response[0]?.headers?.['x-message-id'] || 'unknown' 
      };

    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      if (!this.config?.apiKey) {
        return false;
      }

      // SendGrid doesn't have a specific ping endpoint, 
      // so we'll just verify the API key format
      return this.config.apiKey.startsWith('SG.') && this.config.apiKey.length > 20;
    } catch (error) {
      this.logger.error('SendGrid connection verification failed:', error);
      return false;
    }
  }

  getProviderName(): string {
    return 'SendGrid';
  }

  getFromAddress(): string {
    return this.config?.fromEmail || 'noreply@schedulepro.com';
  }
}
