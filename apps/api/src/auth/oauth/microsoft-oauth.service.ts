import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { PrismaService } from '../../database/prisma.service';
import axios from 'axios';

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

class MicrosoftAuthProvider implements AuthenticationProvider {
  constructor(private accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

@Injectable()
export class MicrosoftOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private tenant: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.clientId = this.configService.get('MICROSOFT_CLIENT_ID');
    this.clientSecret = this.configService.get('MICROSOFT_CLIENT_SECRET');
    this.tenant = this.configService.get('MICROSOFT_TENANT_ID') || 'common';
    this.redirectUri = `${this.configService.get('API_URL')}/api/v1/oauth/microsoft/callback`;
  }

  /**
   * Generate Microsoft OAuth authorization URL
   */
  getAuthUrl(userId: string): string {
    const scopes = [
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
    ].join(' ');

    const authUrl = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize?` +
      `client_id=${this.clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
      `response_mode=query&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${userId}&` +
      `prompt=consent`;

    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string) {
    try {
      const userId = state;

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);

      // Get user info and calendar details
      const authProvider = new MicrosoftAuthProvider(tokenResponse.access_token);
      const graphClient = Client.initWithMiddleware({ authProvider });

      const user = await graphClient.api('/me').get();
      const calendars = await graphClient.api('/me/calendars').get();
      
      const primaryCalendar = calendars.value.find(cal => cal.isDefaultCalendar) || calendars.value[0];

      // Create calendar integration
      const integration = await this.prisma.calendarIntegration.create({
        data: {
          userId,
          provider: 'OUTLOOK',
          name: `Microsoft Outlook - ${primaryCalendar?.name || 'Calendar'}`,
          description: 'Microsoft Outlook integration via OAuth',
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          calendarId: primaryCalendar?.id || 'default',
          isActive: true,
          syncEnabled: true,
          conflictDetection: true,
        },
      });

      return {
        success: true,
        integration,
        message: 'Microsoft Outlook connected successfully',
      };
    } catch (error) {
      throw new BadRequestException(`OAuth callback failed: ${error.message}`);
    }
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<MicrosoftTokenResponse> {
    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await axios.post(tokenEndpoint, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      const tokenEndpoint = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/token`;
      
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await axios.post(tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      return response.data.access_token;
    } catch (error) {
      throw new BadRequestException(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Validate and test calendar access
   */
  async validateAccess(accessToken: string): Promise<boolean> {
    try {
      const authProvider = new MicrosoftAuthProvider(accessToken);
      const graphClient = Client.initWithMiddleware({ authProvider });
      
      await graphClient.api('/me/calendars').get();
      return true;
    } catch (error) {
      return false;
    }
  }
}
