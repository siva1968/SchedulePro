import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../../database/prisma.service';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class GoogleOAuthService {
  private oauth2Client: any;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      `${this.configService.get('API_URL')}/api/v1/oauth/google/callback`,
    );
  }

  /**
   * Generate Google OAuth authorization URL
   */
  getAuthUrl(userId: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId,
      prompt: 'consent',
    });

    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string) {
    try {
      const userId = state;

      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Get user info and calendar details
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const userInfo = await oauth2.userinfo.get();
      const calendarList = await calendar.calendarList.list();
      
      const primaryCalendar = calendarList.data.items?.find(cal => cal.primary) || calendarList.data.items?.[0];

      // Create calendar integration
      const integration = await this.prisma.calendarIntegration.create({
        data: {
          userId,
          provider: 'GOOGLE',
          name: `Google Calendar - ${primaryCalendar?.summary || 'Primary'}`,
          description: 'Google Calendar integration via OAuth',
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token!,
          calendarId: primaryCalendar?.id || 'primary',
          isActive: true,
          syncEnabled: true,
          conflictDetection: true,
        },
      });

      return {
        success: true,
        integration,
        message: 'Google Calendar connected successfully',
      };
    } catch (error) {
      throw new BadRequestException(`OAuth callback failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return credentials.access_token!;
    } catch (error) {
      throw new BadRequestException(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Validate and test calendar access
   */
  async validateAccess(accessToken: string): Promise<boolean> {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
      await calendar.calendarList.list();
      return true;
    } catch (error) {
      return false;
    }
  }
}
