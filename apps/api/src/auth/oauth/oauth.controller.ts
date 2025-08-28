import { Controller, Get, Query, Req, Res, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { GoogleOAuthService } from './google-oauth.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import { PrismaService } from '../../database/prisma.service';
import { Request, Response } from 'express';

interface AuthRequest extends Request {
  user?: {
    sub: string;
    [key: string]: any;
  };
}

@ApiTags('OAuth')
@Controller('oauth')
export class OAuthController {
  constructor(
    private googleOAuthService: GoogleOAuthService,
    private microsoftOAuthService: MicrosoftOAuthService,
    private prisma: PrismaService,
  ) {}

  @Get('google/auth')
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
  @ApiQuery({ name: 'userId', description: 'User ID for OAuth state' })
  googleAuth(@Query('userId') userId: string, @Res() res: Response) {
    const authUrl = this.googleOAuthService.getAuthUrl(userId);
    res.redirect(authUrl);
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 200, description: 'OAuth callback processed successfully' })
  @ApiResponse({ status: 400, description: 'OAuth callback failed' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(`${process.env.WEB_URL}/dashboard/calendar?error=oauth_denied`);
    }

    try {
      const result = await this.googleOAuthService.handleCallback(code, state);
      
      // Redirect to frontend with success
      res.redirect(
        `${process.env.WEB_URL}/dashboard/calendar?success=google_connected&integration=${result.integration.id}`
      );
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect(`${process.env.WEB_URL}/dashboard/calendar?error=oauth_failed`);
    }
  }

  @Get('microsoft/auth')
  @ApiOperation({ summary: 'Initiate Microsoft OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirects to Microsoft OAuth' })
  @ApiQuery({ name: 'userId', description: 'User ID for OAuth state' })
  microsoftAuth(@Query('userId') userId: string, @Res() res: Response) {
    const authUrl = this.microsoftOAuthService.getAuthUrl(userId);
    res.redirect(authUrl);
  }

  @Get('microsoft/callback')
  @ApiOperation({ summary: 'Handle Microsoft OAuth callback' })
  @ApiResponse({ status: 200, description: 'OAuth callback processed successfully' })
  @ApiResponse({ status: 400, description: 'OAuth callback failed' })
  async microsoftCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(`${process.env.WEB_URL}/dashboard/calendar?error=oauth_denied`);
    }

    try {
      const result = await this.microsoftOAuthService.handleCallback(code, state);
      
      // Redirect to frontend with success
      res.redirect(
        `${process.env.WEB_URL}/dashboard/calendar?success=microsoft_connected&integration=${result.integration.id}`
      );
    } catch (error) {
      console.error('Microsoft OAuth callback error:', error);
      res.redirect(`${process.env.WEB_URL}/dashboard/calendar?error=oauth_failed`);
    }
  }

  @Get('validate/:provider/:integrationId')
  @ApiOperation({ summary: 'Validate OAuth token for integration' })
  @ApiResponse({ status: 200, description: 'Token validation result' })
  async validateToken(
    @Param('provider') provider: string,
    @Param('integrationId') integrationId: string,
  ) {
    try {
      // Get integration from database
      const integration = await this.getIntegrationById(integrationId);
      
      if (!integration) {
        return { valid: false, error: 'Integration not found' };
      }

      let isValid = false;

      switch (provider.toLowerCase()) {
        case 'google':
          isValid = await this.googleOAuthService.validateAccess(integration.accessToken);
          break;
        case 'microsoft':
          isValid = await this.microsoftOAuthService.validateAccess(integration.accessToken);
          break;
        default:
          return { valid: false, error: 'Unsupported provider' };
      }

      return { valid: isValid };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  @Get('refresh/:provider/:integrationId')
  @ApiOperation({ summary: 'Refresh OAuth token for integration' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refreshToken(
    @Param('provider') provider: string,
    @Param('integrationId') integrationId: string,
  ) {
    try {
      // Get integration from database
      const integration = await this.getIntegrationById(integrationId);
      
      if (!integration || !integration.refreshToken) {
        return { success: false, error: 'Integration not found or no refresh token' };
      }

      let newAccessToken: string;

      switch (provider.toLowerCase()) {
        case 'google':
          newAccessToken = await this.googleOAuthService.refreshAccessToken(integration.refreshToken);
          break;
        case 'microsoft':
          newAccessToken = await this.microsoftOAuthService.refreshAccessToken(integration.refreshToken);
          break;
        default:
          return { success: false, error: 'Unsupported provider' };
      }

      // Update token in database
      await this.updateIntegrationToken(integrationId, newAccessToken);

      return { success: true, message: 'Token refreshed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('disconnect/:integrationId')
  @ApiOperation({ summary: 'Disconnect OAuth integration' })
  @ApiResponse({ status: 200, description: 'Integration disconnected successfully' })
  async disconnectIntegration(@Param('integrationId') integrationId: string) {
    try {
      // Note: This should also revoke tokens with the provider
      // For now, we'll just deactivate the integration
      await this.deactivateIntegration(integrationId);
      
      return { success: true, message: 'Integration disconnected successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Helper methods - these would normally be in a service
  private async getIntegrationById(integrationId: string) {
    return await this.prisma.calendarIntegration.findUnique({
      where: { id: integrationId },
    });
  }

  private async updateIntegrationToken(integrationId: string, accessToken: string) {
    return await this.prisma.calendarIntegration.update({
      where: { id: integrationId },
      data: { 
        accessToken,
        updatedAt: new Date(),
      },
    });
  }

  private async deactivateIntegration(integrationId: string) {
    return await this.prisma.calendarIntegration.update({
      where: { id: integrationId },
      data: { 
        isActive: false,
        accessToken: null,
        refreshToken: null,
        updatedAt: new Date(),
      },
    });
  }
}
