import {
  Controller,
  Get,
  Query,
  Redirect,
  Request,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoogleCalendarService } from './google-calendar.service';
import { OutlookCalendarService } from './outlook-calendar.service';
import { CalendarService } from './calendar.service';
import { CalendarProvider } from './dto';
import { ConfigService } from '@nestjs/config';
import { MicrosoftOAuthService } from '../auth/oauth/microsoft-oauth.service';
import { ZoomOAuthService } from './services/zoom-oauth.service';

@ApiTags('calendar-oauth')
@Controller('calendar/oauth')
export class CalendarOAuthController {
  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly outlookCalendarService: OutlookCalendarService,
    private readonly calendarService: CalendarService,
    private readonly configService: ConfigService,
    private readonly microsoftOAuthService: MicrosoftOAuthService,
    private readonly zoomOAuthService: ZoomOAuthService,
  ) {}

  @Get('google')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate Google Calendar OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  @Redirect()
  async initiateGoogleOAuth(
    @Request() req: any,
    @Query('integrationName') integrationName?: string,
  ) {
    try {
      // Create state parameter with user ID and optional integration name
      const state = JSON.stringify({
        userId: req.user.id,
        integrationName: integrationName || 'Google Calendar',
      });

      const authUrl = this.googleCalendarService.getAuthUrl(Buffer.from(state).toString('base64'));
      
      return { url: authUrl };
    } catch (error) {
      throw new InternalServerErrorException('Failed to initiate Google OAuth');
    }
  }

  @Get('google/url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Google Calendar OAuth URL (JSON response)' })
  @ApiResponse({ status: 200, description: 'Returns OAuth URL as JSON' })
  async getGoogleOAuthUrl(
    @Request() req: any,
    @Query('integrationName') integrationName?: string,
  ) {
    try {
      // Create state parameter with user ID and optional integration name
      const state = JSON.stringify({
        userId: req.user.id,
        integrationName: integrationName || 'Google Calendar',
      });

      const authUrl = this.googleCalendarService.getAuthUrl(Buffer.from(state).toString('base64'));
      
      return { authUrl };
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate Google OAuth URL');
    }
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Handle Google Calendar OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with result' })
  @Redirect()
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    
    if (error) {
      return {
        url: `${frontendUrl}/dashboard/calendar?error=${encodeURIComponent(error)}`,
      };
    }

    if (!code || !state) {
      return {
        url: `${frontendUrl}/dashboard/calendar?error=missing_parameters`,
      };
    }

    try {
      // Decode state parameter
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId, integrationName } = decodedState;

      // Exchange code for tokens
      const tokens = await this.googleCalendarService.getTokensFromCode(code);
      
      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      // Get user profile for additional info
      const profile = await this.googleCalendarService.getUserProfile(tokens.access_token);
      
      // Get calendar list to show primary calendar
      const calendars = await this.googleCalendarService.getCalendarList(tokens.access_token);
      const primaryCalendar = calendars.find(cal => cal.primary) || calendars[0];

      // Create calendar integration
      const integration = await this.calendarService.createIntegration(userId, {
        provider: CalendarProvider.GOOGLE,
        name: integrationName || `${profile.name}'s Google Calendar`,
        description: `Google Calendar integration for ${profile.email}`,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        calendarId: primaryCalendar?.id || 'primary',
        syncEnabled: true,
        conflictDetection: true,
        timezone: primaryCalendar?.timeZone || 'UTC',
      });

      return {
        url: `${frontendUrl}/dashboard/calendar?success=true&integration=${integration.id}`,
      };
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      return {
        url: `${frontendUrl}/dashboard/calendar?error=${encodeURIComponent('authentication_failed')}`,
      };
    }
  }

  @Get('google/calendars')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Google Calendar list for authenticated user' })
  @ApiResponse({ status: 200, description: 'Calendar list retrieved successfully' })
  async getGoogleCalendars(
    @Request() req: any,
    @Query('integrationId') integrationId: string,
  ) {
    if (!integrationId) {
      throw new BadRequestException('Integration ID is required');
    }

    try {
      // Get the integration to access tokens
      const integration = await this.calendarService.findOneIntegration(req.user.id, integrationId);
      
      if (integration.provider !== CalendarProvider.GOOGLE) {
        throw new BadRequestException('Integration is not a Google Calendar integration');
      }

      // Get calendar list
      const calendars = await this.googleCalendarService.getCalendarList(integration.accessToken);
      
      return {
        calendars: calendars.map(cal => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          timeZone: cal.timeZone,
          primary: cal.primary,
          accessRole: cal.accessRole,
          backgroundColor: cal.backgroundColor,
        })),
      };
    } catch (error) {
      if (error.message.includes('invalid_grant') || error.message.includes('unauthorized')) {
        throw new BadRequestException('Google Calendar access token has expired. Please reconnect.');
      }
      throw new InternalServerErrorException('Failed to retrieve Google Calendar list');
    }
  }

  @Get('google/events')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Google Calendar events for conflict checking' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
  async getGoogleEvents(
    @Request() req: any,
    @Query('integrationId') integrationId: string,
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Query('calendarId') calendarId?: string,
  ) {
    if (!integrationId || !timeMin || !timeMax) {
      throw new BadRequestException('Integration ID, timeMin, and timeMax are required');
    }

    try {
      // Get the integration to access tokens
      const integration = await this.calendarService.findOneIntegration(req.user.id, integrationId);
      
      if (integration.provider !== CalendarProvider.GOOGLE) {
        throw new BadRequestException('Integration is not a Google Calendar integration');
      }

      // Get events for the specified time range
      const events = await this.googleCalendarService.getEvents(
        integration.accessToken,
        calendarId || integration.calendarId || 'primary',
        timeMin,
        timeMax,
      );
      
      return {
        events: events.map(event => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start,
          end: event.end,
          location: event.location,
          attendees: event.attendees,
        })),
      };
    } catch (error) {
      if (error.message.includes('invalid_grant') || error.message.includes('unauthorized')) {
        throw new BadRequestException('Google Calendar access token has expired. Please reconnect.');
      }
      throw new InternalServerErrorException('Failed to retrieve Google Calendar events');
    }
  }

  // ===============================
  // OUTLOOK CALENDAR OAUTH
  // ===============================

  @Get('outlook')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate Outlook Calendar OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Microsoft OAuth' })
  @Redirect()
  async initiateOutlookOAuth(
    @Request() req: any,
    @Query('integrationName') integrationName?: string,
  ) {
    try {
      // Create state parameter with user ID and optional integration name
      const state = JSON.stringify({
        userId: req.user.id,
        integrationName: integrationName || 'Outlook Calendar',
        provider: 'outlook',
      });

      const authUrl = this.microsoftOAuthService.getAuthUrl(Buffer.from(state).toString('base64'));
      
      return { url: authUrl };
    } catch (error) {
      throw new InternalServerErrorException('Failed to initiate Outlook OAuth');
    }
  }

  @Get('outlook/url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Outlook Calendar OAuth URL (JSON response)' })
  @ApiResponse({ status: 200, description: 'Returns OAuth URL as JSON' })
  async getOutlookOAuthUrl(
    @Request() req: any,
    @Query('integrationName') integrationName?: string,
  ) {
    try {
      // Create state parameter with user ID and optional integration name
      const state = JSON.stringify({
        userId: req.user.id,
        integrationName: integrationName || 'Outlook Calendar',
        provider: 'outlook',
      });

      const authUrl = this.microsoftOAuthService.getAuthUrl(Buffer.from(state).toString('base64'));
      
      return { authUrl };
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate Outlook OAuth URL');
    }
  }

  @Get('outlook/callback')
  @ApiOperation({ summary: 'Handle Outlook Calendar OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with result' })
  @Redirect()
  async handleOutlookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    
    if (error) {
      return {
        url: `${frontendUrl}/dashboard/calendar?error=${encodeURIComponent(error)}`,
      };
    }

    if (!code || !state) {
      return {
        url: `${frontendUrl}/dashboard/calendar?error=missing_parameters`,
      };
    }

    try {
      console.log('Outlook OAuth callback received:', { code: !!code, state: !!state });
      
      // Decode state parameter for logging and validation
      let decodedState;
      try {
        decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        console.log('Decoded state in controller:', decodedState);
      } catch (parseError) {
        console.error('Failed to decode state in controller:', parseError);
        return {
          url: `${frontendUrl}/dashboard/calendar?error=invalid_state`,
        };
      }
      
      const { userId, integrationName } = decodedState;

      // Use Microsoft OAuth service to handle the callback with correct parameters
      const result = await this.microsoftOAuthService.handleCallback(code, state);
      
      if (!result.success || !result.integration) {
        throw new Error('Failed to create integration');
      }

      // Update the integration name if provided
      if (integrationName && integrationName !== 'Outlook Calendar') {
        await this.calendarService.updateIntegration(userId, result.integration.id, {
          name: integrationName,
        });
      }

      return {
        url: `${frontendUrl}/dashboard/calendar?success=true&integration=${result.integration.id}`,
      };
    } catch (error) {
      console.error('Outlook OAuth callback error:', error);
      return {
        url: `${frontendUrl}/dashboard/calendar?error=${encodeURIComponent('authentication_failed')}`,
      };
    }
  }

  @Get('outlook/calendars')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Outlook calendars for integration' })
  @ApiResponse({ status: 200, description: 'List of Outlook calendars' })
  async getOutlookCalendars(
    @Request() req: any,
    @Query('integrationId') integrationId: string,
  ) {
    if (!integrationId) {
      throw new BadRequestException('Integration ID is required');
    }

    try {
      // Get the integration to access tokens
      const integration = await this.calendarService.findOneIntegration(req.user.id, integrationId);
      
      if (integration.provider !== CalendarProvider.OUTLOOK) {
        throw new BadRequestException('Integration is not an Outlook Calendar integration');
      }

      // Get calendar list
      const calendars = await this.outlookCalendarService.getCalendarList(integration.accessToken);
      
      return {
        calendars: calendars.map(cal => ({
          id: cal.id,
          name: cal.name,
          description: cal.description,
          color: cal.color,
          isDefaultCalendar: cal.isDefaultCalendar,
          canShare: cal.canShare,
          canEdit: cal.canEdit,
          owner: cal.owner,
        })),
      };
    } catch (error) {
      if (error.message.includes('invalid_grant') || error.message.includes('unauthorized')) {
        throw new BadRequestException('Outlook Calendar access token has expired. Please reconnect.');
      }
      throw new InternalServerErrorException('Failed to retrieve Outlook Calendar list');
    }
  }

  @Get('outlook/events')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Outlook events for integration' })
  @ApiResponse({ status: 200, description: 'List of Outlook events' })
  async getOutlookEvents(
    @Request() req: any,
    @Query('integrationId') integrationId: string,
    @Query('timeMin') timeMin: string,
    @Query('timeMax') timeMax: string,
    @Query('calendarId') calendarId?: string,
  ) {
    if (!integrationId || !timeMin || !timeMax) {
      throw new BadRequestException('Integration ID, timeMin, and timeMax are required');
    }

    try {
      // Get the integration to access tokens
      const integration = await this.calendarService.findOneIntegration(req.user.id, integrationId);
      
      if (integration.provider !== CalendarProvider.OUTLOOK) {
        throw new BadRequestException('Integration is not an Outlook Calendar integration');
      }

      // Get events for the specified time range
      const events = await this.outlookCalendarService.getEvents(
        integration.accessToken,
        calendarId || integration.calendarId || 'primary',
        timeMin,
        timeMax,
      );

      return {
        events: events.map(event => ({
          id: event.id,
          subject: event.subject,
          start: event.start,
          end: event.end,
          location: event.location,
          attendees: event.attendees,
          showAs: event.showAs,
          sensitivity: event.sensitivity,
        })),
      };
    } catch (error) {
      if (error.message.includes('invalid_grant') || error.message.includes('unauthorized')) {
        throw new BadRequestException('Outlook Calendar access token has expired. Please reconnect.');
      }
      throw new InternalServerErrorException('Failed to retrieve Outlook Calendar events');
    }
  }

  // ============================================================================
  // ZOOM OAUTH
  // ============================================================================

  @Get('zoom')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Initiate Zoom OAuth flow' })
  @ApiResponse({ status: 302, description: 'Redirect to Zoom OAuth' })
  @Redirect()
  async initiateZoomOAuth(
    @Request() req: any,
    @Query('integrationName') integrationName?: string,
  ) {
    try {
      // Create state parameter with user ID and optional integration name
      const state = JSON.stringify({
        userId: req.user.id,
        integrationName: integrationName || 'Zoom',
        provider: 'zoom',
      });

      const authUrl = this.zoomOAuthService.generateAuthUrl(Buffer.from(state).toString('base64'));
      
      return { url: authUrl };
    } catch (error) {
      throw new InternalServerErrorException('Failed to initiate Zoom OAuth');
    }
  }

  @Get('zoom/url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Zoom OAuth URL (JSON response)' })
  @ApiResponse({ status: 200, description: 'Returns OAuth URL as JSON' })
  async getZoomOAuthUrl(
    @Request() req: any,
    @Query('integrationName') integrationName?: string,
  ) {
    try {
      // Create state parameter with user ID and optional integration name
      const state = JSON.stringify({
        userId: req.user.id,
        integrationName: integrationName || 'Zoom',
        provider: 'zoom',
      });

      const authUrl = this.zoomOAuthService.generateAuthUrl(Buffer.from(state).toString('base64'));
      
      return { authUrl };
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate Zoom OAuth URL');
    }
  }

  @Get('zoom/callback')
  @ApiOperation({ summary: 'Handle Zoom OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with result' })
  @Redirect()
  async handleZoomCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    
    if (error) {
      return {
        url: `${frontendUrl}/dashboard/calendar?error=${encodeURIComponent(error)}`,
      };
    }

    if (!code || !state) {
      return {
        url: `${frontendUrl}/dashboard/calendar?error=missing_parameters`,
      };
    }

    try {
      console.log('Zoom OAuth callback received:', { code: !!code, state: !!state });
      
      // Decode state parameter
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId, integrationName } = decodedState;

      console.log('Decoded state:', { userId, integrationName });

      // Exchange code for tokens
      const tokens = await this.zoomOAuthService.exchangeCodeForTokens(code);
      
      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      console.log('Tokens received from Zoom');

      // Get user profile
      const profile = await this.zoomOAuthService.getUserProfile(tokens.access_token);
      
      console.log('Zoom profile retrieved:', { email: profile.email, id: profile.id });

      // Save tokens and integration
      await this.zoomOAuthService.saveTokens(userId, tokens, profile);

      console.log('Zoom integration created successfully');

      return {
        url: `${frontendUrl}/dashboard/calendar?success=true&provider=zoom`,
      };
    } catch (error) {
      console.error('Zoom OAuth callback error:', error);
      return {
        url: `${frontendUrl}/dashboard/calendar?error=${encodeURIComponent('authentication_failed')}`,
      };
    }
  }
}
