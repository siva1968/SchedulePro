import { IsEmail, IsString, IsOptional, IsBoolean, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EmailProviderDto {
  NODEMAILER = 'NODEMAILER',
  SENDGRID = 'SENDGRID',
  ZEPTO = 'ZEPTO',
}

export class CreateEmailSettingsDto {
  @ApiProperty({ enum: EmailProviderDto, description: 'Email provider type' })
  @IsEnum(EmailProviderDto)
  provider: EmailProviderDto;

  @ApiProperty({ description: 'From email address' })
  @IsEmail()
  fromEmail: string;

  @ApiProperty({ description: 'From name' })
  @IsString()
  fromName: string;

  @ApiPropertyOptional({ description: 'Reply-to email address' })
  @IsOptional()
  @IsEmail()
  replyToEmail?: string;

  // SMTP/Nodemailer settings
  @ApiPropertyOptional({ description: 'SMTP host' })
  @IsOptional()
  @IsString()
  smtpHost?: string;

  @ApiPropertyOptional({ description: 'SMTP port' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @ApiPropertyOptional({ description: 'Use secure connection (SSL/TLS)' })
  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @ApiPropertyOptional({ description: 'SMTP username' })
  @IsOptional()
  @IsString()
  smtpUsername?: string;

  @ApiPropertyOptional({ description: 'SMTP password' })
  @IsOptional()
  @IsString()
  smtpPassword?: string;

  // SendGrid settings
  @ApiPropertyOptional({ description: 'SendGrid API key' })
  @IsOptional()
  @IsString()
  sendgridApiKey?: string;

  // Zepto settings
  @ApiPropertyOptional({ description: 'Zepto API key' })
  @IsOptional()
  @IsString()
  zeptoApiKey?: string;

  @ApiPropertyOptional({ description: 'Zepto API URL' })
  @IsOptional()
  @IsString()
  zeptoApiUrl?: string;
}

export class UpdateEmailSettingsDto extends CreateEmailSettingsDto {
  @ApiPropertyOptional({ description: 'Set as active email provider' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestEmailDto {
  @ApiProperty({ description: 'Test email recipient' })
  @IsEmail()
  testEmail: string;
}

export class EmailSettingsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: EmailProviderDto })
  provider: EmailProviderDto;

  @ApiProperty()
  fromEmail: string;

  @ApiProperty()
  fromName: string;

  @ApiPropertyOptional()
  replyToEmail?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  lastTestedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  // Sensitive fields are excluded from response
}
