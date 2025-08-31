import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@ApiTags('Public')
@Controller('public')
export class PublicSystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get('registration-status')
  @ApiOperation({ summary: 'Get registration enabled status (Public)' })
  @ApiResponse({
    status: 200,
    description: 'Registration status',
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async getRegistrationStatus(): Promise<{ enabled: boolean; message: string }> {
    const enabled = await this.systemSettingsService.isRegistrationEnabled();
    return {
      enabled,
      message: enabled ? 'User registration is enabled' : 'User registration is disabled',
    };
  }
}
