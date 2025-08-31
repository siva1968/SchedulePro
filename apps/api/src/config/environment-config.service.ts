import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './env.validation';

@Injectable()
export class EnvironmentConfigService {
  constructor(private readonly configService: ConfigService<EnvironmentVariables>) {}

  // Environment
  get nodeEnv(): string {
    return this.configService.get('NODE_ENV', 'development');
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  // API Configuration
  get apiPort(): number {
    return this.configService.get('API_PORT', 3001);
  }

  get frontendUrl(): string {
    return this.configService.get('FRONTEND_URL', 'http://localhost:3000');
  }

  get apiUrl(): string {
    return this.configService.get('API_URL', 'http://localhost:3001');
  }

  // Database
  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL')!;
  }

  get redisUrl(): string | undefined {
    return this.configService.get('REDIS_URL');
  }

  // JWT Configuration
  get jwtSecret(): string {
    return this.configService.get('JWT_SECRET')!;
  }

  get jwtExpiresIn(): string {
    return this.configService.get('JWT_EXPIRES_IN', '7d');
  }

  get refreshTokenSecret(): string {
    return this.configService.get('REFRESH_TOKEN_SECRET')!;
  }

  get refreshTokenExpiresIn(): string {
    return this.configService.get('REFRESH_TOKEN_EXPIRES_IN', '30d');
  }

  // SMTP Configuration
  get smtpHost(): string {
    return this.configService.get('SMTP_HOST')!;
  }

  get smtpPort(): number {
    return this.configService.get('SMTP_PORT')!;
  }

  get smtpUser(): string | undefined {
    return this.configService.get('SMTP_USER');
  }

  get smtpPass(): string | undefined {
    return this.configService.get('SMTP_PASS');
  }

  get smtpFrom(): string {
    return this.configService.get('SMTP_FROM', 'noreply@schedulepro.com');
  }

  // OAuth Configuration
  get googleClientId(): string | undefined {
    return this.configService.get('GOOGLE_CLIENT_ID');
  }

  get googleClientSecret(): string | undefined {
    return this.configService.get('GOOGLE_CLIENT_SECRET');
  }

  get microsoftClientId(): string | undefined {
    return this.configService.get('MICROSOFT_CLIENT_ID');
  }

  get microsoftClientSecret(): string | undefined {
    return this.configService.get('MICROSOFT_CLIENT_SECRET');
  }

  // Calendar Encryption
  get calendarEncryptionKey(): string {
    return this.configService.get('CALENDAR_ENCRYPTION_KEY')!;
  }

  get encryptionKey(): string {
    return this.configService.get('ENCRYPTION_KEY')!;
  }

  // File Upload Configuration
  get maxFileSize(): number {
    return this.configService.get('MAX_FILE_SIZE', 5000000);
  }

  get uploadPath(): string {
    return this.configService.get('UPLOAD_PATH', './uploads');
  }

  // Rate Limiting
  get rateLimitTtl(): number {
    return this.configService.get('THROTTLE_TTL', 60);
  }

  get rateLimitMax(): number {
    return this.configService.get('THROTTLE_LIMIT', 60);
  }

  // Utility methods for feature flags
  get hasRedis(): boolean {
    return !!this.redisUrl;
  }

  get hasGoogleOAuth(): boolean {
    return !!(this.googleClientId && this.googleClientSecret);
  }

  get hasMicrosoftOAuth(): boolean {
    return !!(this.microsoftClientId && this.microsoftClientSecret);
  }

  get hasSmtpConfig(): boolean {
    return !!(this.smtpHost && this.smtpPort);
  }

  // Get email configuration
  getEmailConfig() {
    return {
      provider: 'NODEMAILER',
      host: this.smtpHost,
      port: this.smtpPort,
      user: this.smtpUser,
      pass: this.smtpPass,
      from: this.smtpFrom,
      enabled: this.hasSmtpConfig,
    };
  }

  // Validation methods
  validateRequiredConfigs(): { valid: boolean; missing: string[] } {
    const required: Array<keyof EnvironmentVariables> = [
      'DATABASE_URL',
      'JWT_SECRET',
      'REFRESH_TOKEN_SECRET',
      'CALENDAR_ENCRYPTION_KEY',
      'ENCRYPTION_KEY',
    ];

    const missing = required.filter(key => !this.configService.get(key));
    
    return {
      valid: missing.length === 0,
      missing: missing as string[],
    };
  }

  // Get all configuration as an object (for debugging)
  getAllConfig(): Record<string, any> {
    return {
      environment: {
        nodeEnv: this.nodeEnv,
        isDevelopment: this.isDevelopment,
        isProduction: this.isProduction,
        isTest: this.isTest,
      },
      api: {
        port: this.apiPort,
        frontendUrl: this.frontendUrl,
        apiUrl: this.apiUrl,
      },
      database: {
        url: this.isDevelopment ? this.databaseUrl : '[HIDDEN]',
        hasRedis: this.hasRedis,
      },
      auth: {
        jwtExpiresIn: this.jwtExpiresIn,
        refreshTokenExpiresIn: this.refreshTokenExpiresIn,
      },
      oauth: {
        hasGoogle: this.hasGoogleOAuth,
        hasMicrosoft: this.hasMicrosoftOAuth,
      },
      email: this.getEmailConfig(),
      features: {
        hasRedis: this.hasRedis,
        hasGoogleOAuth: this.hasGoogleOAuth,
        hasMicrosoftOAuth: this.hasMicrosoftOAuth,
        hasEmailProvider: this.hasSmtpConfig,
      },
    };
  }
}
