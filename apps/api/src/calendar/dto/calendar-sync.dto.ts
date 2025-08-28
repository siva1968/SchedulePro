import { IsOptional, IsEnum, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { CalendarProvider } from './create-calendar-integration.dto';

export class CalendarSyncDto {
  @IsString()
  eventTitle: string;

  @IsString()
  eventDescription?: string;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  externalEventId?: string;

  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @IsString()
  @IsOptional()
  recurrenceRule?: string;
}

export class CalendarQueryDto {
  @IsEnum(CalendarProvider)
  @IsOptional()
  provider?: CalendarProvider;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  syncEnabled?: boolean;

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
