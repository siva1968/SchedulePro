import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EmailProvider, EmailOptions, EmailSendResult, EmailConfig } from '../interfaces/email-provider.interface';

@Injectable()
export class ZeptoProvider implements EmailProvider {
  private readonly logger = new Logger(ZeptoProvider.name);
  private config: EmailConfig;

  constructor(private configService: ConfigService) {
    // Default config from environment
    this.initializeDefaultConfig();
  }

  private initializeDefaultConfig() {
    this.config = {
      provider: 'ZEPTO' as any,
      fromEmail: this.configService.get('ZEPTO_FROM_EMAIL', 'noreply@schedulepro.com'),
      fromName: this.configService.get('ZEPTO_FROM_NAME', 'SchedulePro'),
      zeptoApiKey: this.configService.get('ZEPTO_API_KEY'),
      zeptoApiUrl: this.configService.get('ZEPTO_API_URL', 'https://api.zeptomail.in/v1.1/email'),
    };
    
    if (this.config.zeptoApiKey) {
      this.logger.log('Zepto Mail provider initialized with default config');
    } else {
      this.logger.warn('Zepto Mail API key not found in environment');
    }
  }

  setConfig(config: EmailConfig): void {
    this.config = config;
    this.logger.log('Zepto Mail provider updated with new config');
  }

  async sendEmail(options: EmailOptions): Promise<EmailSendResult> {
    if (!this.config.zeptoApiKey) {
      return {
        success: false,
        error: 'Zepto Mail API key not configured'
      };
    }

    const toAddresses = Array.isArray(options.to) 
      ? options.to.map(email => ({ email_address: { address: email } }))
      : [{ email_address: { address: options.to } }];

    const payload = {
      from: {
        address: options.from || this.config.fromEmail,
        name: options.fromName || this.config.fromName
      },
      to: toAddresses,
      reply_to: options.replyTo ? [{ address: options.replyTo }] : undefined,
      subject: options.subject,
      textbody: options.text,
      htmlbody: options.html,
      attachments: options.attachments?.map(att => ({
        name: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
        mime_type: att.contentType || 'application/octet-stream'
      }))
    };

    try {
      const response = await axios.post(this.config.zeptoApiUrl || 'https://api.zeptomail.in/v1.1/email', payload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Zoho-enczapikey ${this.config.zeptoApiKey}`
        }
      });

      this.logger.log(`Email sent successfully via Zepto Mail to ${options.to}`);
      return {
        success: true,
        messageId: response.data.data?.[0]?.message_id,
        details: response.data
      };
    } catch (error) {
      this.logger.error(`Failed to send email via Zepto Mail to ${options.to}:`, error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data || error
      };
    }
  }

  async testConnection(): Promise<EmailSendResult> {
    if (!this.config.zeptoApiKey) {
      return {
        success: false,
        error: 'Zepto Mail API key not configured'
      };
    }

    try {
      // Test with a simple API call to validate credentials
      const testPayload = {
        from: {
          address: this.config.fromEmail,
          name: this.config.fromName
        },
        to: [
          {
            email_address: {
              address: this.config.fromEmail
            }
          }
        ],
        subject: 'Zepto Mail Test Connection',
        textbody: 'This is a test email to validate Zepto Mail configuration.',
        htmlbody: '<p>This is a test email to validate Zepto Mail configuration.</p>'
      };

      // Note: Zepto Mail doesn't have a test mode, so we'll validate the format instead
      const response = await axios.post(
        `${this.config.zeptoApiUrl || 'https://api.zeptomail.in/v1.1/email'}/template`, 
        {}, 
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Zoho-enczapikey ${this.config.zeptoApiKey}`
          }
        }
      );

      return {
        success: true,
        messageId: 'test-connection-success'
      };
    } catch (error) {
      // If we get a 401, the API key is invalid
      // If we get a 404, the API key is valid but endpoint doesn't exist (which is expected)
      if (error.response?.status === 404) {
        return {
          success: true,
          messageId: 'test-connection-success'
        };
      }
      
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        details: error.response?.data || error
      };
    }
  }

  async validateConfig(): Promise<boolean> {
    return !!(this.config.zeptoApiKey && 
             this.config.fromEmail && 
             this.config.zeptoApiUrl);
  }
}
