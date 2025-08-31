import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import axios from 'axios';

export interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

export interface ZoomUserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  type: number;
  pmi: number;
  timezone: string;
  verified: number;
  dept: string;
  created_at: string;
  last_login_time: string;
  last_client_version: string;
  pic_url: string;
  host_key: string;
  jid: string;
  group_ids: string[];
  im_group_ids: string[];
  account_id: string;
  language: string;
  phone_country: string;
  phone_number: string;
  status: string;
}

@Injectable()
export class ZoomOAuthService {
  private readonly logger = new Logger(ZoomOAuthService.name);
  private readonly zoomClientId: string;
  private readonly zoomClientSecret: string;
  private readonly zoomRedirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.zoomClientId = this.configService.get<string>('ZOOM_CLIENT_ID');
    this.zoomClientSecret = this.configService.get<string>('ZOOM_CLIENT_SECRET');
    this.zoomRedirectUri = this.configService.get<string>('ZOOM_REDIRECT_URI');
  }

  generateAuthUrl(state: string): string {
    const baseUrl = 'https://zoom.us/oauth/authorize';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.zoomClientId,
      redirect_uri: this.zoomRedirectUri,
      scope: 'meeting:write meeting:read user:read calendar:read calendar:write',
      state,
    });

    return `${baseUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<ZoomTokenResponse> {
    try {
      const response = await axios.post(
        'https://zoom.us/oauth/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.zoomRedirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${this.zoomClientId}:${this.zoomClientSecret}`,
            ).toString('base64')}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to exchange code for tokens', error.response?.data);
      throw new Error('Failed to authenticate with Zoom');
    }
  }

  async getUserProfile(accessToken: string): Promise<ZoomUserProfile> {
    try {
      const response = await axios.get('https://api.zoom.us/v2/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get user profile', error.response?.data);
      throw new Error('Failed to get Zoom user profile');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<ZoomTokenResponse> {
    try {
      const response = await axios.post(
        'https://zoom.us/oauth/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${this.zoomClientId}:${this.zoomClientSecret}`,
            ).toString('base64')}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to refresh access token', error.response?.data);
      throw new Error('Failed to refresh Zoom access token');
    }
  }

  async saveTokens(
    userId: string,
    tokens: ZoomTokenResponse,
    userProfile: ZoomUserProfile,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await this.prisma.calendarIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: 'ZOOM',
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        providerAccountId: userProfile.id,
        providerEmail: userProfile.email,
        isActive: true,
        lastSyncAt: new Date(),
      },
      create: {
        userId,
        provider: 'ZOOM',
        name: `${userProfile.first_name} ${userProfile.last_name}'s Zoom`,
        description: `Zoom integration for ${userProfile.email}`,
        providerAccountId: userProfile.id,
        providerEmail: userProfile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });
  }

  async createMeeting(
    accessToken: string,
    meetingData: {
      topic: string;
      start_time: string;
      duration: number;
      timezone?: string;
      agenda?: string;
    },
  ): Promise<any> {
    try {
      const response = await axios.post(
        'https://api.zoom.us/v2/users/me/meetings',
        {
          topic: meetingData.topic,
          type: 2, // Scheduled meeting
          start_time: meetingData.start_time,
          duration: meetingData.duration,
          timezone: meetingData.timezone || 'UTC',
          agenda: meetingData.agenda || '',
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: false,
            mute_upon_entry: false,
            watermark: false,
            use_pmi: false,
            approval_type: 2,
            audio: 'both',
            auto_recording: 'none',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Zoom meeting', error.response?.data);
      throw new Error('Failed to create Zoom meeting');
    }
  }

  async revokeAccess(userId: string): Promise<void> {
    await this.prisma.calendarIntegration.updateMany({
      where: {
        userId,
        provider: 'ZOOM',
      },
      data: {
        isActive: false,
        accessToken: null,
        refreshToken: null,
      },
    });
  }
}
