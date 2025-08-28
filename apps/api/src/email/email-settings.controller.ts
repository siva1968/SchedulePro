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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SystemAdminGuard } from '../auth/guards/system-admin.guard';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from './email.service';
import {
  CreateEmailSettingsDto,
  UpdateEmailSettingsDto,
  TestEmailDto,
  EmailSettingsResponseDto,
} from './dto/email-settings.dto';

@ApiTags('Email Settings (System Admin)')
@ApiBearerAuth()
@Controller('admin/email-settings')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
export class EmailSettingsController {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all email settings (System Admin only)' })
  @ApiResponse({ status: 200, description: 'Email settings retrieved successfully', type: [EmailSettingsResponseDto] })
  async getAllEmailSettings(): Promise<EmailSettingsResponseDto[]> {
    const settings = await this.prisma.emailSettings.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        creator: { select: { email: true, firstName: true, lastName: true } },
        updater: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    return settings.map(setting => ({
      id: setting.id,
      provider: setting.provider as any,
      fromEmail: setting.fromEmail,
      fromName: setting.fromName,
      replyToEmail: setting.replyToEmail,
      isActive: setting.isActive,
      lastTestedAt: setting.lastTestedAt,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
      // Exclude sensitive information
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get email settings by ID (System Admin only)' })
  @ApiResponse({ status: 200, description: 'Email settings retrieved successfully', type: EmailSettingsResponseDto })
  async getEmailSettingsById(@Param('id') id: string): Promise<EmailSettingsResponseDto> {
    const setting = await this.prisma.emailSettings.findUnique({
      where: { id },
      include: {
        creator: { select: { email: true, firstName: true, lastName: true } },
        updater: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!setting) {
      throw new HttpException('Email settings not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: setting.id,
      provider: setting.provider as any,
      fromEmail: setting.fromEmail,
      fromName: setting.fromName,
      replyToEmail: setting.replyToEmail,
      isActive: setting.isActive,
      lastTestedAt: setting.lastTestedAt,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create new email settings (System Admin only)' })
  @ApiResponse({ status: 201, description: 'Email settings created successfully', type: EmailSettingsResponseDto })
  async createEmailSettings(
    @Body() createDto: CreateEmailSettingsDto,
    @Request() req: any,
  ): Promise<EmailSettingsResponseDto> {
    const userId = req.user.sub || req.user.id;

    // If this is the first email setting or marked as active, deactivate others
    const existingSettings = await this.prisma.emailSettings.findMany();
    const shouldActivate = existingSettings.length === 0;

    if (shouldActivate) {
      await this.prisma.emailSettings.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const emailSettings = await this.prisma.emailSettings.create({
      data: {
        ...createDto,
        isActive: shouldActivate,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    // If this is now the active provider, switch to it
    if (shouldActivate) {
      await this.emailService.switchProvider(emailSettings);
    }

    return {
      id: emailSettings.id,
      provider: emailSettings.provider as any,
      fromEmail: emailSettings.fromEmail,
      fromName: emailSettings.fromName,
      replyToEmail: emailSettings.replyToEmail,
      isActive: emailSettings.isActive,
      lastTestedAt: emailSettings.lastTestedAt,
      createdAt: emailSettings.createdAt,
      updatedAt: emailSettings.updatedAt,
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update email settings (System Admin only)' })
  @ApiResponse({ status: 200, description: 'Email settings updated successfully', type: EmailSettingsResponseDto })
  async updateEmailSettings(
    @Param('id') id: string,
    @Body() updateDto: UpdateEmailSettingsDto,
    @Request() req: any,
  ): Promise<EmailSettingsResponseDto> {
    const userId = req.user.sub || req.user.id;

    const existingSetting = await this.prisma.emailSettings.findUnique({
      where: { id },
    });

    if (!existingSetting) {
      throw new HttpException('Email settings not found', HttpStatus.NOT_FOUND);
    }

    // If setting isActive to true, deactivate others
    if (updateDto.isActive) {
      await this.prisma.emailSettings.updateMany({
        where: { id: { not: id }, isActive: true },
        data: { isActive: false },
      });
    }

    const updatedSettings = await this.prisma.emailSettings.update({
      where: { id },
      data: {
        ...updateDto,
        updatedBy: userId,
      },
    });

    // If this is now the active provider, switch to it
    if (updatedSettings.isActive) {
      await this.emailService.switchProvider(updatedSettings);
    }

    return {
      id: updatedSettings.id,
      provider: updatedSettings.provider as any,
      fromEmail: updatedSettings.fromEmail,
      fromName: updatedSettings.fromName,
      replyToEmail: updatedSettings.replyToEmail,
      isActive: updatedSettings.isActive,
      lastTestedAt: updatedSettings.lastTestedAt,
      createdAt: updatedSettings.createdAt,
      updatedAt: updatedSettings.updatedAt,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete email settings (System Admin only)' })
  @ApiResponse({ status: 200, description: 'Email settings deleted successfully' })
  async deleteEmailSettings(@Param('id') id: string): Promise<{ message: string }> {
    const existingSetting = await this.prisma.emailSettings.findUnique({
      where: { id },
    });

    if (!existingSetting) {
      throw new HttpException('Email settings not found', HttpStatus.NOT_FOUND);
    }

    if (existingSetting.isActive) {
      throw new HttpException('Cannot delete active email settings', HttpStatus.BAD_REQUEST);
    }

    await this.prisma.emailSettings.delete({
      where: { id },
    });

    return { message: 'Email settings deleted successfully' };
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test email settings (System Admin only)' })
  @ApiResponse({ status: 200, description: 'Email test completed' })
  async testEmailSettings(
    @Param('id') id: string,
    @Body() testDto: TestEmailDto,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const emailSettings = await this.prisma.emailSettings.findUnique({
      where: { id },
    });

    if (!emailSettings) {
      throw new HttpException('Email settings not found', HttpStatus.NOT_FOUND);
    }

    // Test the connection first
    const connectionResult = await this.emailService.testEmailProvider(id);
    
    if (!connectionResult.success) {
      await this.prisma.emailSettings.update({
        where: { id },
        data: {
          lastTestedAt: new Date(),
          testResult: {
            success: false,
            error: connectionResult.error,
            testedAt: new Date(),
          },
        },
      });

      return {
        success: false,
        error: connectionResult.error,
      };
    }

    // If connection test passed, send a test email
    try {
      const testResult = await this.emailService.sendEmail({
        to: testDto.testEmail,
        subject: 'SchedulePro Email Settings Test',
        text: `This is a test email from SchedulePro using the ${emailSettings.provider} provider.`,
        html: `
          <h2>SchedulePro Email Test</h2>
          <p>This is a test email from SchedulePro using the <strong>${emailSettings.provider}</strong> provider.</p>
          <p>If you receive this email, the email configuration is working correctly!</p>
          <hr>
          <small>Sent at: ${new Date().toISOString()}</small>
        `,
      });

      await this.prisma.emailSettings.update({
        where: { id },
        data: {
          lastTestedAt: new Date(),
          testResult: {
            success: testResult.success,
            messageId: testResult.messageId,
            error: testResult.error,
            testedAt: new Date(),
            testRecipient: testDto.testEmail,
          },
        },
      });

      return {
        success: testResult.success,
        message: testResult.success 
          ? 'Test email sent successfully' 
          : 'Failed to send test email',
        error: testResult.error,
      };
    } catch (error) {
      await this.prisma.emailSettings.update({
        where: { id },
        data: {
          lastTestedAt: new Date(),
          testResult: {
            success: false,
            error: error.message,
            testedAt: new Date(),
            testRecipient: testDto.testEmail,
          },
        },
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate email settings (System Admin only)' })
  @ApiResponse({ status: 200, description: 'Email settings activated successfully' })
  async activateEmailSettings(@Param('id') id: string): Promise<{ message: string }> {
    const emailSettings = await this.prisma.emailSettings.findUnique({
      where: { id },
    });

    if (!emailSettings) {
      throw new HttpException('Email settings not found', HttpStatus.NOT_FOUND);
    }

    // Deactivate all other settings
    await this.prisma.emailSettings.updateMany({
      where: { id: { not: id } },
      data: { isActive: false },
    });

    // Activate this setting
    const updatedSettings = await this.prisma.emailSettings.update({
      where: { id },
      data: { isActive: true },
    });

    // Switch to this provider
    await this.emailService.switchProvider(updatedSettings);

    return { message: 'Email settings activated successfully' };
  }
}
