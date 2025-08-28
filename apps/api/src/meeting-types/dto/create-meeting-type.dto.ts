import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMeetingTypeDto {
  @ApiProperty({
    description: 'Meeting type name',
    example: '30-minute consultation',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Meeting type description',
    example: 'A quick consultation call to discuss your needs',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Meeting duration in minutes',
    example: 30,
    minimum: 15,
    maximum: 480,
  })
  @IsNumber()
  @Min(15)
  @Max(480)
  duration: number;

  @ApiProperty({
    description: 'Organization ID this meeting type belongs to',
    example: 'uuid-string',
  })
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @ApiProperty({
    description: 'Meeting location or link',
    example: 'https://zoom.us/j/123456789',
    required: false,
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({
    description: 'Buffer time before meeting in minutes',
    example: 5,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(60)
  bufferBefore?: number;

  @ApiProperty({
    description: 'Buffer time after meeting in minutes',
    example: 5,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(60)
  bufferAfter?: number;

  @ApiProperty({
    description: 'Whether the meeting type is active',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description: 'Minimum notice time in minutes',
    example: 1440, // 24 hours
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  requiredNoticeMinutes?: number;
}
