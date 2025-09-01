import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsArray,
  ValidateNested,
  IsObject,
  IsNumber,
  IsPhoneNumber,
  MaxLength,
  MinLength,
  IsUUID,
  IsUrl,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
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
  @ApiProperty({ description: 'Attendee email address' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  email: string;

  @ApiProperty({ description: 'Attendee full name' })
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiPropertyOptional({ description: 'Attendee phone number' })
  @IsOptional()
  @IsPhoneNumber(null, { message: 'Please provide a valid phone number' })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'User ID if attendee is a registered user' })
  @IsOptional()
  @IsUUID('4', { message: 'User ID must be a valid UUID' })
  userId?: string;
}

export class CreateBookingDto {
  @ApiProperty({ description: 'Meeting type ID' })
  @IsUUID('4', { message: 'Meeting type ID must be a valid UUID' })
  meetingTypeId: string;

  @ApiProperty({ description: 'Booking start time in ISO format' })
  @IsDateString({}, { message: 'Start time must be a valid ISO date string' })
  startTime: string;

  @ApiProperty({ description: 'Booking end time in ISO format' })
  @IsDateString({}, { message: 'End time must be a valid ISO date string' })
  endTime: string;

  @ApiPropertyOptional({ description: 'Custom booking title' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  @Transform(({ value }) => value?.trim())
  title?: string;

  @ApiPropertyOptional({ description: 'Booking description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes must not exceed 500 characters' })
  @Transform(({ value }) => value?.trim())
  notes?: string;

  @ApiPropertyOptional({ enum: LocationType })
  @IsOptional()
  @IsEnum(LocationType)
  locationType?: LocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  locationDetails?: any;

  @ApiPropertyOptional({ description: 'Meeting URL for online meetings' })
  @IsOptional()
  @IsUrl({}, { message: 'Meeting URL must be a valid URL' })
  @MaxLength(500, { message: 'Meeting URL must not exceed 500 characters' })
  meetingUrl?: string;

  @ApiPropertyOptional({
    enum: MeetingProvider,
    description: 'Meeting provider for this booking',
    example: 'GOOGLE_MEET'
  })
  @IsOptional()
  @IsEnum(MeetingProvider, { message: 'Invalid meeting provider' })
  meetingProvider?: MeetingProvider;

  @ApiPropertyOptional({ description: 'Form responses as JSON object' })
  @IsOptional()
  @IsObject()
  formResponses?: any;

  @ApiPropertyOptional({ 
    description: 'Payment amount in cents',
    minimum: 0,
    maximum: 100000000 // $1M max
  })
  @IsOptional()
  @IsNumber({}, { message: 'Payment amount must be a valid number' })
  @Min(0, { message: 'Payment amount cannot be negative' })
  @Max(100000000, { message: 'Payment amount exceeds maximum allowed' })
  paymentAmount?: number;

  @ApiProperty({ 
    type: [CreateBookingAttendeeDto],
    description: 'List of attendees (1-10 attendees allowed)'
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one attendee is required' })
  @ArrayMaxSize(10, { message: 'Maximum 10 attendees allowed' })
  @ValidateNested({ each: true })
  @Type(() => CreateBookingAttendeeDto)
  attendees: CreateBookingAttendeeDto[];

  @ApiPropertyOptional({ 
    description: 'Timezone for the booking (e.g., "Asia/Kolkata", "America/New_York")',
    example: 'Asia/Kolkata'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Timezone must not exceed 100 characters' })
  timezone?: string;
}
