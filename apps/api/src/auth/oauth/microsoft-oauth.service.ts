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
    
    // Use explicit redirect URI that matches Azure app registration
    const apiUrl = this.configService.get('API_URL');
    this.redirectUri = `${apiUrl}/api/v1/calendar/oauth/outlook/callback`;
    
    console.log('Microsoft OAuth Configuration:');
    console.log('Client ID:', this.clientId);
    console.log('Tenant:', this.tenant);
    console.log('Redirect URI:', this.redirectUri);
  }

  /**
   * Generate Microsoft OAuth authorization URL
   */
  getAuthUrl(state: string): string {
    const scopes = [
      'https://graph.microsoft.com/Calendars.Read',
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
    ].join(' ');

    console.log('Microsoft OAuth Auth URL generation:');
    console.log('Client ID:', this.clientId);
    console.log('Redirect URI:', this.redirectUri);
    console.log('Tenant:', this.tenant);
    console.log('Scopes:', scopes);

    const authUrl = `https://login.microsoftonline.com/${this.tenant}/oauth2/v2.0/authorize?` +
      `client_id=${this.clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(this.redirectUri)}&` +
      `response_mode=query&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}&` +
      `prompt=consent`;

    console.log('Generated Auth URL:', authUrl);
    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string) {
    try {
      console.log('Microsoft OAuth callback - Code:', code ? 'Present' : 'Missing');
      console.log('Microsoft OAuth callback - State:', state ? 'Present' : 'Missing');
      console.log('Raw state parameter:', state);
      
      // Decode state parameter to get userId and integrationName
      let decodedState;
      try {
        const decodedBuffer = Buffer.from(state, 'base64').toString();
        console.log('Decoded base64 string:', decodedBuffer);
        decodedState = JSON.parse(decodedBuffer);
        console.log('Parsed JSON state:', decodedState);
      } catch (parseError) {
        console.error('Failed to parse state parameter:', parseError);
        console.error('Raw state:', state);
        console.error('Decoded buffer:', Buffer.from(state, 'base64').toString());
        throw new BadRequestException(`OAuth callback failed: Invalid state parameter - ${parseError.message}`);
      }
      
      const { userId, integrationName } = decodedState;

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
          name: integrationName || `Microsoft Outlook - ${primaryCalendar?.name || 'Calendar'}`,
          description: `Microsoft Outlook integration for ${user.mail || user.userPrincipalName}`,
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          calendarId: primaryCalendar?.id || 'default',
          isActive: true,
          syncEnabled: true,
          conflictDetection: true,
          timezone: primaryCalendar?.timeZone || 'UTC',
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

    try {
      console.log('Microsoft token request URL:', tokenEndpoint);
      console.log('Microsoft token request params:', {
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        code: code ? 'Present' : 'Missing'
      });
      console.log('Full request body:', params.toString());
      
      const response = await axios.post(tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      console.log('Microsoft token exchange SUCCESS:');
      console.log('Response status:', response.status);
      console.log('Response data type:', typeof response.data);
      console.log('Response data:', response.data);
      
      return response.data;
    } catch (error) {
      console.error('Microsoft token exchange FAILED:');
      console.error('Error type:', error.constructor.name);
      console.error('Status:', error.response?.status);
      console.error('Status text:', error.response?.statusText);
      console.error('Headers:', error.response?.headers);
      console.error('Data type:', typeof error.response?.data);
      console.error('Raw response data (first 500 chars):', 
        typeof error.response?.data === 'string' 
          ? error.response.data.substring(0, 500) 
          : error.response?.data);
      console.error('Full response data:', error.response?.data);
      
      // Additional debugging: Try to identify common Microsoft OAuth errors
      if (error.response?.status === 400) {
        console.error('HTTP 400 Bad Request - Possible causes:');
        console.error('1. Redirect URI mismatch in Azure app registration');
        console.error('2. Invalid client credentials');
        console.error('3. Malformed request parameters');
        console.error('4. Authorization code already used or expired');
      }
      
      if (error.response?.data) {
        // Microsoft returned an error response
        const errorData = error.response.data;
        
        // Check if response is HTML (indicating a configuration error)
        if (typeof errorData === 'string' && errorData.includes('<html')) {
          throw new Error('Microsoft OAuth configuration error: Received HTML response instead of JSON. Check Azure app registration redirect URI.');
        }
        
        if (errorData.error) {
          throw new Error(`Microsoft OAuth error: ${errorData.error} - ${errorData.error_description || 'Unknown error'}`);
        }
      }
      
      throw new Error(`Failed to exchange code for tokens: ${error.message}`);
    }
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
