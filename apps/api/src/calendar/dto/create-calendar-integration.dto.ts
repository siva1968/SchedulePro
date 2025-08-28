import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export enum CalendarProvider {
  GOOGLE = 'google',
  OUTLOOK = 'outlook',
  CALDAV = 'caldav',
}

export class CreateCalendarIntegrationDto {
  @IsEnum(CalendarProvider)
  provider: CalendarProvider;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  accessToken: string;

  @IsString()
  @IsOptional()
  refreshToken?: string;

  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsBoolean()
  @IsOptional()
  syncEnabled: boolean = true;

  @IsBoolean()
  @IsOptional()
  conflictDetection: boolean = true;

  @IsString()
  @IsOptional()
  timezone?: string;
}
