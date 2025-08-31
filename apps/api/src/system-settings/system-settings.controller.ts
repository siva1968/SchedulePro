import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  UseGuards, 
  Request,
  HttpStatus,
  HttpException,
  Query
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard, SystemAdminGuard } from '../auth/guards';
import { SystemSettingsService } from './system-settings.service';
import { 
  CreateSystemSettingDto, 
  UpdateSystemSettingDto, 
  SystemSettingResponseDto 
} from './dto';

@ApiTags('System Settings (Super Admin)')
@ApiBearerAuth()
@Controller('admin/system-settings')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all system settings (Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all system settings',
    type: [SystemSettingResponseDto],
  })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  async getAllSettings(@Query('category') category?: string): Promise<SystemSettingResponseDto[]> {
    const settings = await this.systemSettingsService.getAllSettings();
    
    if (category) {
      return settings.filter(setting => setting.category === category);
    }
    
    return settings;
  }

  @Get(':settingKey')
  @ApiOperation({ summary: 'Get system setting by key (Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'System setting details',
    type: SystemSettingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'System setting not found',
  })
  async getSettingByKey(@Param('settingKey') settingKey: string): Promise<SystemSettingResponseDto> {
    const setting = await this.systemSettingsService.getSettingByKey(settingKey);
    
    if (!setting) {
      throw new HttpException('System setting not found', HttpStatus.NOT_FOUND);
    }
    
    return setting;
  }

  @Post()
  @ApiOperation({ summary: 'Create new system setting (Super Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'System setting created successfully',
    type: SystemSettingResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or setting already exists',
  })
  async createSetting(
    @Body() createDto: CreateSystemSettingDto,
    @Request() req: any,
  ): Promise<SystemSettingResponseDto> {
    const userId = req.user.sub || req.user.id;

    // Check if setting already exists
    const existingSetting = await this.systemSettingsService.getSettingByKey(createDto.settingKey);
    if (existingSetting) {
      throw new HttpException('System setting with this key already exists', HttpStatus.BAD_REQUEST);
    }

    return this.systemSettingsService.createSetting(createDto, userId);
  }

  @Put(':settingKey')
  @ApiOperation({ summary: 'Update system setting (Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'System setting updated successfully',
    type: SystemSettingResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'System setting not found',
  })
  async updateSetting(
    @Param('settingKey') settingKey: string,
    @Body() updateDto: UpdateSystemSettingDto,
    @Request() req: any,
  ): Promise<SystemSettingResponseDto> {
    const userId = req.user.sub || req.user.id;
    return this.systemSettingsService.updateSetting(settingKey, updateDto, userId);
  }

  @Delete(':settingKey')
  @ApiOperation({ summary: 'Delete system setting (Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'System setting deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'System setting not found',
  })
  async deleteSetting(@Param('settingKey') settingKey: string): Promise<{ message: string }> {
    await this.systemSettingsService.deleteSetting(settingKey);
    return { message: 'System setting deleted successfully' };
  }

  // Specific endpoints for common settings
  
  @Get('auth/registration-status')
  @ApiOperation({ summary: 'Get registration enabled status' })
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

  @Post('auth/toggle-registration')
  @ApiOperation({ summary: 'Enable/disable user registration (Super Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Registration setting updated successfully',
    type: SystemSettingResponseDto,
  })
  async toggleRegistration(
    @Body() body: { enabled: boolean },
    @Request() req: any,
  ): Promise<SystemSettingResponseDto> {
    const userId = req.user.sub || req.user.id;
    return this.systemSettingsService.setRegistrationEnabled(body.enabled, userId);
  }
}
