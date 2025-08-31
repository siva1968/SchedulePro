import { ApiProperty } from '@nestjs/swagger';

export class SystemSettingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  settingKey: string;

  @ApiProperty()
  settingValue: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  updatedBy?: {
    email: string;
    firstName: string;
    lastName: string;
  };
}
