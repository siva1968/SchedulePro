import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsBoolean,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AvailabilityType {
  RECURRING = 'RECURRING',
  DATE_SPECIFIC = 'DATE_SPECIFIC',
  BLOCKED = 'BLOCKED',
}

export class CreateAvailabilityDto {
  @ApiProperty({ enum: AvailabilityType })
  @IsEnum(AvailabilityType)
  type: AvailabilityType;

  @ApiPropertyOptional({ description: 'Day of week (0-6, Sunday=0)', minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiProperty({ description: 'Start time in HH:MM format', example: '09:00' })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Start time must be in HH:MM format',
  })
  startTime: string;

  @ApiProperty({ description: 'End time in HH:MM format', example: '17:00' })
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'End time must be in HH:MM format',
  })
  endTime: string;

  @ApiPropertyOptional({ description: 'Specific date for date-specific availability' })
  @IsOptional()
  @IsDateString()
  specificDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blockReason?: string;
}
