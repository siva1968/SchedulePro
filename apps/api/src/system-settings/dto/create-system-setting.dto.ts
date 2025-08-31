import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSystemSettingDto {
  @ApiProperty({ description: 'Unique setting key', example: 'registration_enabled' })
  @IsString()
  settingKey: string;

  @ApiProperty({ description: 'Setting value (JSON)', example: 'true' })
  @IsString()
  settingValue: string;

  @ApiPropertyOptional({ description: 'Human readable description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Setting category', default: 'general' })
  @IsOptional()
  @IsString()
  category?: string;
}
