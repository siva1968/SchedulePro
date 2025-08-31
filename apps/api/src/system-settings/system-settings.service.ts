import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateSystemSettingDto, UpdateSystemSettingDto, SystemSettingResponseDto } from './dto';

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  async getAllSettings(): Promise<SystemSettingResponseDto[]> {
    const settings = await this.prisma.systemSettings.findMany({
      orderBy: { category: 'asc' },
      include: {
        updater: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    return settings.map(setting => ({
      id: setting.id,
      settingKey: setting.settingKey,
      settingValue: setting.settingValue,
      description: setting.description,
      category: setting.category,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updater ? {
        email: setting.updater.email,
        firstName: setting.updater.firstName,
        lastName: setting.updater.lastName,
      } : undefined,
    }));
  }

  async getSettingByKey(settingKey: string): Promise<SystemSettingResponseDto | null> {
    const setting = await this.prisma.systemSettings.findUnique({
      where: { settingKey },
      include: {
        updater: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!setting) {
      return null;
    }

    return {
      id: setting.id,
      settingKey: setting.settingKey,
      settingValue: setting.settingValue,
      description: setting.description,
      category: setting.category,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updater ? {
        email: setting.updater.email,
        firstName: setting.updater.firstName,
        lastName: setting.updater.lastName,
      } : undefined,
    };
  }

  async createSetting(createDto: CreateSystemSettingDto, updatedBy: string): Promise<SystemSettingResponseDto> {
    const setting = await this.prisma.systemSettings.create({
      data: {
        ...createDto,
        updatedBy,
      },
      include: {
        updater: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    return {
      id: setting.id,
      settingKey: setting.settingKey,
      settingValue: setting.settingValue,
      description: setting.description,
      category: setting.category,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updater ? {
        email: setting.updater.email,
        firstName: setting.updater.firstName,
        lastName: setting.updater.lastName,
      } : undefined,
    };
  }

  async updateSetting(settingKey: string, updateDto: UpdateSystemSettingDto, updatedBy: string): Promise<SystemSettingResponseDto> {
    const existingSetting = await this.prisma.systemSettings.findUnique({
      where: { settingKey },
    });

    if (!existingSetting) {
      throw new NotFoundException('System setting not found');
    }

    const setting = await this.prisma.systemSettings.update({
      where: { settingKey },
      data: {
        ...updateDto,
        updatedBy,
      },
      include: {
        updater: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    return {
      id: setting.id,
      settingKey: setting.settingKey,
      settingValue: setting.settingValue,
      description: setting.description,
      category: setting.category,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updater ? {
        email: setting.updater.email,
        firstName: setting.updater.firstName,
        lastName: setting.updater.lastName,
      } : undefined,
    };
  }

  async deleteSetting(settingKey: string): Promise<void> {
    const existingSetting = await this.prisma.systemSettings.findUnique({
      where: { settingKey },
    });

    if (!existingSetting) {
      throw new NotFoundException('System setting not found');
    }

    await this.prisma.systemSettings.delete({
      where: { settingKey },
    });
  }

  // Helper methods for specific settings
  async isRegistrationEnabled(): Promise<boolean> {
    const setting = await this.getSettingByKey('registration_enabled');
    if (!setting) {
      return true; // Default to enabled if not set
    }
    return setting.settingValue === 'true';
  }

  async setRegistrationEnabled(enabled: boolean, updatedBy: string): Promise<SystemSettingResponseDto> {
    const existing = await this.getSettingByKey('registration_enabled');
    
    if (existing) {
      return this.updateSetting('registration_enabled', {
        settingValue: enabled.toString(),
      }, updatedBy);
    } else {
      return this.createSetting({
        settingKey: 'registration_enabled',
        settingValue: enabled.toString(),
        description: 'Controls whether new user registration is allowed',
        category: 'authentication',
      }, updatedBy);
    }
  }
}
