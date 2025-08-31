import { plainToInstance, Transform } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsEmail,
  IsUrl,
  IsOptional,
  IsEnum,
  MinLength,
  IsPort,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  API_PORT: number = 3001;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters long' })
  JWT_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'REFRESH_TOKEN_SECRET must be at least 32 characters long' })
  REFRESH_TOKEN_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string = '7d';

  @IsString()
  REFRESH_TOKEN_EXPIRES_IN: string = '30d';

  @IsString()
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsString()
  FRONTEND_URL: string;

  @IsString()
  API_URL: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  MICROSOFT_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  MICROSOFT_CLIENT_SECRET?: string;

  @IsString()
  @MinLength(32, { message: 'ENCRYPTION_KEY must be at least 32 characters long' })
  ENCRYPTION_KEY: string;

  @IsString()
  @MinLength(32, { message: 'CALENDAR_ENCRYPTION_KEY must be at least 32 characters long' })
  CALENDAR_ENCRYPTION_KEY: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  MAX_FILE_SIZE: number = 5000000;

  @IsString()
  UPLOAD_PATH: string = './uploads';

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  THROTTLE_TTL: number = 60;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  THROTTLE_LIMIT: number = 60;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    skipNullProperties: false,
    skipUndefinedProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map(error => {
      const constraints = error.constraints || {};
      const property = error.property;
      const value = error.value;
      const constraintMessages = Object.values(constraints);
      return `${property}: ${constraintMessages.join(', ')} (received: ${value})`;
    }).join('; ');
    
    console.warn(`Environment validation warnings: ${errorMessages}`);
    
    // For now, just warn instead of throwing to allow the app to start
    // In production, you might want to throw here
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Environment validation failed: ${errorMessages}`);
    }
  }

  return validatedConfig;
}
