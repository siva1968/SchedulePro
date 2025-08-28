import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { PrismaService } from '../database/prisma.service';

export interface OutlookCalendarEvent {
  id?: string;
  subject: string;
  body?: {
    contentType: 'HTML' | 'Text';
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: 'required' | 'optional' | 'resource';
  }>;
  location?: {
    displayName: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      countryOrRegion?: string;
      postalCode?: string;
    };
  };
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: 'teamsForBusiness' | 'skypeForBusiness';
  categories?: string[];
  sensitivity?: 'normal' | 'personal' | 'private' | 'confidential';
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
  importance?: 'low' | 'normal' | 'high';
  reminder?: number; // minutes before event
}

class GraphAuthProvider implements AuthenticationProvider {
  constructor(private accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

@Injectable()
export class OutlookCalendarService {
  private readonly logger = new Logger(OutlookCalendarService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * Create a Microsoft Graph client with access token
   */
  private createGraphClient(accessToken: string): Client {
    const authProvider = new GraphAuthProvider(accessToken);
    return Client.initWithMiddleware({ authProvider });
  }

  /**
   * Get user's calendar list
   */
  async getCalendarList(accessToken: string) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      const calendars = await graphClient.api('/me/calendars').get();
      
      return calendars.value.map(cal => ({
        id: cal.id,
        name: cal.name,
        description: cal.description,
        color: cal.color,
        isDefaultCalendar: cal.isDefaultCalendar,
        canShare: cal.canShare,
        canViewPrivateItems: cal.canViewPrivateItems,
        canEdit: cal.canEdit,
        owner: cal.owner,
      }));
    } catch (error) {
      this.logger.error('Failed to get Outlook calendar list:', error);
      throw new BadRequestException('Failed to retrieve Outlook calendar list');
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile(accessToken: string) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      const profile = await graphClient.api('/me').get();
      
      return {
        id: profile.id,
        displayName: profile.displayName,
        mail: profile.mail || profile.userPrincipalName,
        givenName: profile.givenName,
        surname: profile.surname,
        jobTitle: profile.jobTitle,
        mobilePhone: profile.mobilePhone,
        officeLocation: profile.officeLocation,
        preferredLanguage: profile.preferredLanguage,
        userPrincipalName: profile.userPrincipalName,
      };
    } catch (error) {
      this.logger.error('Failed to get Outlook user profile:', error);
      throw new BadRequestException('Failed to retrieve user profile');
    }
  }

  /**
   * Create a calendar event
   */
  async createEvent(
    accessToken: string,
    calendarId: string,
    eventData: OutlookCalendarEvent,
  ) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      const event = {
        subject: eventData.subject,
        body: eventData.body || {
          contentType: 'HTML',
          content: '',
        },
        start: eventData.start,
        end: eventData.end,
        attendees: eventData.attendees || [],
        location: eventData.location,
        isOnlineMeeting: eventData.isOnlineMeeting || false,
        onlineMeetingProvider: eventData.onlineMeetingProvider || 'teamsForBusiness',
        categories: eventData.categories || [],
        sensitivity: eventData.sensitivity || 'normal',
        showAs: eventData.showAs || 'busy',
        importance: eventData.importance || 'normal',
      };

      // Add reminder if specified
      if (eventData.reminder !== undefined) {
        event['isReminderOn'] = true;
        event['reminderMinutesBeforeStart'] = eventData.reminder;
      }

      const endpoint = calendarId === 'primary' || !calendarId 
        ? '/me/events' 
        : `/me/calendars/${calendarId}/events`;

      const createdEvent = await graphClient.api(endpoint).post(event);
      
      this.logger.log(`Created Outlook event: ${createdEvent.id}`);
      
      return {
        id: createdEvent.id,
        webLink: createdEvent.webLink,
        onlineMeeting: createdEvent.onlineMeeting,
        event: createdEvent,
      };
    } catch (error) {
      this.logger.error('Failed to create Outlook calendar event:', error);
      throw new BadRequestException('Failed to create Outlook calendar event');
    }
  }

  /**
   * Update a calendar event
   */
  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    eventData: Partial<OutlookCalendarEvent>,
  ) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      const updateData: any = {};
      
      if (eventData.subject) updateData.subject = eventData.subject;
      if (eventData.body) updateData.body = eventData.body;
      if (eventData.start) updateData.start = eventData.start;
      if (eventData.end) updateData.end = eventData.end;
      if (eventData.attendees) updateData.attendees = eventData.attendees;
      if (eventData.location) updateData.location = eventData.location;
      if (eventData.isOnlineMeeting !== undefined) updateData.isOnlineMeeting = eventData.isOnlineMeeting;
      if (eventData.categories) updateData.categories = eventData.categories;
      if (eventData.sensitivity) updateData.sensitivity = eventData.sensitivity;
      if (eventData.showAs) updateData.showAs = eventData.showAs;
      if (eventData.importance) updateData.importance = eventData.importance;

      if (eventData.reminder !== undefined) {
        updateData.isReminderOn = true;
        updateData.reminderMinutesBeforeStart = eventData.reminder;
      }

      const endpoint = calendarId === 'primary' || !calendarId 
        ? `/me/events/${eventId}` 
        : `/me/calendars/${calendarId}/events/${eventId}`;

      const updatedEvent = await graphClient.api(endpoint).patch(updateData);
      
      this.logger.log(`Updated Outlook event: ${eventId}`);
      
      return updatedEvent;
    } catch (error) {
      this.logger.error('Failed to update Outlook calendar event:', error);
      throw new BadRequestException('Failed to update Outlook calendar event');
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(accessToken: string, calendarId: string, eventId: string) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      const endpoint = calendarId === 'primary' || !calendarId 
        ? `/me/events/${eventId}` 
        : `/me/calendars/${calendarId}/events/${eventId}`;

      await graphClient.api(endpoint).delete();
      
      this.logger.log(`Deleted Outlook event: ${eventId}`);
      
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to delete Outlook calendar event:', error);
      throw new BadRequestException('Failed to delete Outlook calendar event');
    }
  }

  /**
   * Get events for conflict detection
   */
  async getEvents(
    accessToken: string,
    calendarId: string,
    startTime: string,
    endTime: string,
  ) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      const endpoint = calendarId === 'primary' || !calendarId 
        ? '/me/events' 
        : `/me/calendars/${calendarId}/events`;

      const events = await graphClient
        .api(endpoint)
        .filter(`start/dateTime ge '${startTime}' and end/dateTime le '${endTime}'`)
        .select('id,subject,start,end,showAs,sensitivity,isCancelled')
        .orderby('start/dateTime')
        .get();

      // Filter out cancelled events and free time
      return events.value.filter(event => 
        !event.isCancelled && 
        event.showAs !== 'free'
      );
    } catch (error) {
      this.logger.error('Failed to get Outlook calendar events:', error);
      throw new BadRequestException('Failed to retrieve Outlook calendar events');
    }
  }

  /**
   * Get free/busy information
   */
  async getFreeBusy(
    accessToken: string,
    emails: string[],
    startTime: string,
    endTime: string,
  ) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      const requestBody = {
        schedules: emails,
        startTime: {
          dateTime: startTime,
          timeZone: 'UTC',
        },
        endTime: {
          dateTime: endTime,
          timeZone: 'UTC',
        },
        availabilityViewInterval: 60, // 60-minute intervals
      };

      const freeBusyInfo = await graphClient
        .api('/me/calendar/getSchedule')
        .post(requestBody);

      return freeBusyInfo.value;
    } catch (error) {
      this.logger.error('Failed to get free/busy information:', error);
      throw new BadRequestException('Failed to retrieve free/busy information');
    }
  }

  /**
   * Get meeting rooms (for enterprise scenarios)
   */
  async getMeetingRooms(accessToken: string) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      // Get room lists first
      const roomLists = await graphClient.api('/me/findRoomLists').get();
      
      const allRooms = [];
      
      // Get rooms from each room list
      for (const roomList of roomLists.value) {
        try {
          const rooms = await graphClient
            .api(`/me/findRooms(RoomList='${roomList.address}')`)
            .get();
          
          allRooms.push(...rooms.value.map(room => ({
            ...room,
            roomListName: roomList.name,
            roomListAddress: roomList.address,
          })));
        } catch (error) {
          this.logger.warn(`Failed to get rooms for ${roomList.name}:`, error);
        }
      }

      return allRooms;
    } catch (error) {
      this.logger.error('Failed to get meeting rooms:', error);
      // Return empty array if room discovery fails (not all tenants support this)
      return [];
    }
  }

  /**
   * Test calendar access
   */
  async testAccess(accessToken: string): Promise<boolean> {
    try {
      const graphClient = this.createGraphClient(accessToken);
      await graphClient.api('/me/calendars').get();
      return true;
    } catch (error) {
      this.logger.error('Outlook calendar access test failed:', error);
      return false;
    }
  }

  /**
   * Refresh access token using Microsoft OAuth service
   */
  async refreshToken(refreshToken: string): Promise<string> {
    try {
      // Import the Microsoft OAuth service
      const { MicrosoftOAuthService } = await import('../auth/oauth/microsoft-oauth.service');
      const oauthService = new MicrosoftOAuthService(this.configService, this.prisma);
      
      return await oauthService.refreshAccessToken(refreshToken);
    } catch (error) {
      this.logger.error('Failed to refresh Outlook access token:', error);
      throw new BadRequestException('Failed to refresh access token');
    }
  }

  /**
   * Create subscription for calendar webhooks (if supported)
   */
  async createWebhookSubscription(
    accessToken: string,
    calendarId: string,
    notificationUrl: string,
  ) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      const subscription = {
        changeType: 'created,updated,deleted',
        notificationUrl,
        resource: calendarId === 'primary' ? '/me/events' : `/me/calendars/${calendarId}/events`,
        expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
        clientState: 'schedulepro-webhook',
      };

      const createdSubscription = await graphClient
        .api('/subscriptions')
        .post(subscription);

      this.logger.log(`Created Outlook webhook subscription: ${createdSubscription.id}`);
      
      return createdSubscription;
    } catch (error) {
      this.logger.error('Failed to create Outlook webhook subscription:', error);
      throw new BadRequestException('Failed to create webhook subscription');
    }
  }

  /**
   * Delete webhook subscription
   */
  async deleteWebhookSubscription(accessToken: string, subscriptionId: string) {
    try {
      const graphClient = this.createGraphClient(accessToken);
      
      await graphClient.api(`/subscriptions/${subscriptionId}`).delete();
      
      this.logger.log(`Deleted Outlook webhook subscription: ${subscriptionId}`);
      
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to delete Outlook webhook subscription:', error);
      throw new BadRequestException('Failed to delete webhook subscription');
    }
  }
}
