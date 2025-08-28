import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsArray,
  ValidateNested,
  IsObject,
  IsDecimal,
  IsPhoneNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LocationType {
  ONLINE = 'ONLINE',
  IN_PERSON = 'IN_PERSON',
  PHONE = 'PHONE',
  CUSTOM = 'CUSTOM',
}

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIAL_REFUND = 'PARTIAL_REFUND',
}

export enum MeetingProvider {
  GOOGLE_MEET = 'GOOGLE_MEET',
  MICROSOFT_TEAMS = 'MICROSOFT_TEAMS',
  ZOOM = 'ZOOM',
  WEBEX = 'WEBEX',
  GOTOMEETING = 'GOTOMEETING',
  CUSTOM = 'CUSTOM',
}

export class CreateBookingAttendeeDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  meetingTypeId: string;

  @ApiProperty()
  @IsDateString()
  startTime: string;

  @ApiProperty()
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: LocationType })
  @IsOptional()
  @IsEnum(LocationType)
  locationType?: LocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  locationDetails?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional({
    enum: MeetingProvider,
    description: 'Meeting provider for this booking',
    example: 'GOOGLE_MEET'
  })
  @IsOptional()
  @IsEnum(MeetingProvider)
  meetingProvider?: MeetingProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  formResponses?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDecimal()
  paymentAmount?: number;

  @ApiProperty({ type: [CreateBookingAttendeeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBookingAttendeeDto)
  attendees: CreateBookingAttendeeDto[];
}
