import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  location?: string;
  conferenceData?: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: {
        type: string;
      };
    };
  };
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private oauth2Client: OAuth2Client;

  constructor(private configService: ConfigService) {
    this.oauth2Client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      `${this.configService.get<string>('API_URL')}/api/v1/calendar/oauth/google/callback`
    );
  }

  /**
   * Generate Google OAuth authorization URL
   */
  getAuthUrl(state?: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: state || '',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      this.logger.error('Failed to exchange code for tokens:', error);
      throw new Error('Failed to authenticate with Google Calendar');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      this.logger.error('Failed to refresh access token:', error);
      throw new Error('Failed to refresh Google Calendar access token');
    }
  }

  /**
   * Get user's calendar list
   */
  async getCalendarList(accessToken: string) {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.calendarList.list();
      return response.data.items || [];
    } catch (error) {
      this.logger.error('Failed to get calendar list:', error);
      throw new Error('Failed to retrieve calendar list');
    }
  }

  /**
   * Create calendar event
   */
  async createEvent(
    accessToken: string,
    calendarId: string = 'primary',
    event: GoogleCalendarEvent
  ) {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.insert({
        calendarId,
        requestBody: event,
        conferenceDataVersion: event.conferenceData ? 1 : undefined,
      });

      this.logger.log(`Created Google Calendar event: ${response.data.id}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create Google Calendar event:', error);
      // Preserve the original error message for proper error handling
      if (error.message) {
        throw new Error(error.message);
      }
      throw error;
    }
  }

  /**
   * Update calendar event
   */
  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: Partial<GoogleCalendarEvent>
  ) {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.update({
        calendarId,
        eventId,
        requestBody: event,
      });

      this.logger.log(`Updated Google Calendar event: ${eventId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to update Google Calendar event:', error);
      throw new Error('Failed to update Google Calendar event');
    }
  }

  /**
   * Get a specific calendar event
   */
  async getEvent(accessToken: string, calendarId: string, eventId: string) {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.get({
        calendarId,
        eventId,
      });

      this.logger.log(`Retrieved Google Calendar event: ${eventId}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get Google Calendar event:', error);
      throw error;
    }
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(accessToken: string, calendarId: string, eventId: string) {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      await calendar.events.delete({
        calendarId,
        eventId,
      });

      this.logger.log(`Deleted Google Calendar event: ${eventId}`);
    } catch (error) {
      this.logger.error('Failed to delete Google Calendar event:', error);
      throw new Error('Failed to delete Google Calendar event');
    }
  }

  /**
   * Get events for conflict detection
   */
  async getEvents(
    accessToken: string,
    calendarId: string,
    timeMin: string,
    timeMax: string
  ) {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const response = await calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      this.logger.error('Failed to get Google Calendar events:', error);
      throw new Error('Failed to retrieve Google Calendar events');
    }
  }

  /**
   * Check for conflicts with existing events
   */
  async checkConflicts(
    accessToken: string,
    calendarId: string,
    startTime: string,
    endTime: string
  ) {
    const events = await this.getEvents(accessToken, calendarId, startTime, endTime);
    
    const conflicts = events.filter(event => {
      if (!event.start?.dateTime || !event.end?.dateTime) return false;
      
      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      const checkStart = new Date(startTime);
      const checkEnd = new Date(endTime);
      
      // Check for overlap
      return (checkStart < eventEnd && checkEnd > eventStart);
    });

    return conflicts.map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
    }));
  }

  /**
   * Get user profile information
   */
  async getUserProfile(accessToken: string) {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      
      const response = await oauth2.userinfo.get();
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get user profile:', error);
      throw new Error('Failed to get user profile');
    }
  }
}
