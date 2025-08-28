export interface EmailProvider {
  sendEmail(options: EmailOptions): Promise<EmailSendResult>;
  testConnection(): Promise<EmailSendResult>;
  validateConfig(): Promise<boolean>;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  encoding?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

export interface EmailConfig {
  provider: EmailProviderType;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  
  // Nodemailer/SMTP config
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsername?: string;
  smtpPassword?: string;
  
  // SendGrid config
  sendgridApiKey?: string;
  
  // Zepto config
  zeptoApiKey?: string;
  zeptoApiUrl?: string;
}

export enum EmailProviderType {
  NODEMAILER = 'NODEMAILER',
  SENDGRID = 'SENDGRID',
  ZEPTO = 'ZEPTO',
}
