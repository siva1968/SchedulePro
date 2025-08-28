import { PartialType } from '@nestjs/mapped-types';
import { CreateCalendarIntegrationDto } from './create-calendar-integration.dto';
import { IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class UpdateCalendarIntegrationDto extends PartialType(CreateCalendarIntegrationDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsEnum(['INCOMING', 'OUTGOING', 'BOTH'])
  @IsOptional()
  syncDirection?: 'INCOMING' | 'OUTGOING' | 'BOTH';
}
