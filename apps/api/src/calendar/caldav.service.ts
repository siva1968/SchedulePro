import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, createCipher, createDecipher } from 'crypto';

export interface CalDAVCalendarEvent {
  uid?: string;
  summary: string;
  description?: string;
  dtstart: string; // YYYYMMDDTHHMMSSZ format
  dtend: string;   // YYYYMMDDTHHMMSSZ format
  location?: string;
  organizer?: {
    name: string;
    email: string;
  };
  attendees?: Array<{
    name: string;
    email: string;
    status?: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
  }>;
  categories?: string[];
  priority?: number; // 1-9 (1 = highest)
  transparency?: 'OPAQUE' | 'TRANSPARENT';
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
}

export interface CalDAVCredentials {
  serverUrl: string;
  username: string;
  password: string;
  calendarPath?: string;
}

@Injectable()
export class CalDAVService {
  private readonly logger = new Logger(CalDAVService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Discover CalDAV server capabilities and calendar collections
   */
  async discoverCalendars(credentials: CalDAVCredentials) {
    try {
      const { serverUrl, username, password } = credentials;
      
      // Step 1: Discover principal URL
      const principalUrl = await this.discoverPrincipal(serverUrl, username, password);
      
      // Step 2: Discover calendar home
      const calendarHomeUrl = await this.discoverCalendarHome(principalUrl, username, password);
      
      // Step 3: List available calendars
      const calendars = await this.listCalendars(calendarHomeUrl, username, password);
      
      return calendars;
    } catch (error) {
      this.logger.error('Failed to discover CalDAV calendars:', error);
      throw new BadRequestException('Failed to discover calendars. Please check your server URL and credentials.');
    }
  }

  /**
   * Discover principal URL using well-known path
   */
  private async discoverPrincipal(serverUrl: string, username: string, password: string): Promise<string> {
    const wellKnownUrl = `${serverUrl}/.well-known/caldav`;
    
    try {
      const response = await axios.request({
        method: 'PROPFIND',
        url: wellKnownUrl,
        auth: { username, password },
        headers: {
          'Content-Type': 'application/xml',
          'Depth': '0',
        },
        data: `<?xml version="1.0" encoding="utf-8"?>
          <propfind xmlns="DAV:">
            <prop>
              <current-user-principal/>
            </prop>
          </propfind>`,
      });

      // Parse response to extract principal URL
      const principalMatch = response.data.match(/<href[^>]*>([^<]+)<\/href>/);
      if (principalMatch) {
        return this.resolveUrl(serverUrl, principalMatch[1]);
      }
    } catch (error) {
      this.logger.warn('Well-known CalDAV discovery failed, trying direct principal path');
    }

    // Fallback to common principal paths
    const commonPaths = [
      `/principals/users/${username}/`,
      `/principals/${username}/`,
      `/caldav/principals/${username}/`,
      `/dav/principals/users/${username}/`,
    ];

    for (const path of commonPaths) {
      try {
        const testUrl = `${serverUrl}${path}`;
        await axios.request({
          method: 'PROPFIND',
          url: testUrl,
          auth: { username, password },
          headers: { 'Depth': '0' },
        });
        return testUrl;
      } catch (error) {
        continue;
      }
    }

    throw new Error('Could not discover principal URL');
  }

  /**
   * Discover calendar home URL
   */
  private async discoverCalendarHome(principalUrl: string, username: string, password: string): Promise<string> {
    try {
      const response = await axios.request({
        method: 'PROPFIND',
        url: principalUrl,
        auth: { username, password },
        headers: {
          'Content-Type': 'application/xml',
          'Depth': '0',
        },
        data: `<?xml version="1.0" encoding="utf-8"?>
          <propfind xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav">
            <prop>
              <caldav:calendar-home-set/>
            </prop>
          </propfind>`,
      });

      const homeMatch = response.data.match(/<href[^>]*>([^<]+)<\/href>/);
      if (homeMatch) {
        return this.resolveUrl(principalUrl, homeMatch[1]);
      }

      throw new Error('Could not find calendar home');
    } catch (error) {
      this.logger.error('Failed to discover calendar home:', error);
      throw error;
    }
  }

  /**
   * List available calendars
   */
  private async listCalendars(calendarHomeUrl: string, username: string, password: string) {
    try {
      const response = await axios.request({
        method: 'PROPFIND',
        url: calendarHomeUrl,
        auth: { username, password },
        headers: {
          'Content-Type': 'application/xml',
          'Depth': '1',
        },
        data: `<?xml version="1.0" encoding="utf-8"?>
          <propfind xmlns="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
            <prop>
              <resourcetype/>
              <displayname/>
              <caldav:calendar-description/>
              <caldav:supported-calendar-component-set/>
              <cs:getctag/>
              <caldav:calendar-color/>
            </prop>
          </propfind>`,
      });

      return this.parseCalendarList(response.data, calendarHomeUrl);
    } catch (error) {
      this.logger.error('Failed to list CalDAV calendars:', error);
      throw error;
    }
  }

  /**
   * Parse calendar list from PROPFIND response
   */
  private parseCalendarList(xmlData: string, baseUrl: string) {
    const calendars = [];
    
    // Simple XML parsing - in production, use a proper XML parser
    const responseRegex = /<response[^>]*>(.*?)<\/response>/gs;
    let match;

    while ((match = responseRegex.exec(xmlData)) !== null) {
      const responseContent = match[1];
      
      // Check if this is a calendar resource
      if (responseContent.includes('<calendar/>')) {
        const href = this.extractXmlValue(responseContent, 'href');
        const displayName = this.extractXmlValue(responseContent, 'displayname');
        const description = this.extractXmlValue(responseContent, 'calendar-description');
        const color = this.extractXmlValue(responseContent, 'calendar-color');
        const ctag = this.extractXmlValue(responseContent, 'getctag');

        if (href && displayName) {
          calendars.push({
            id: href,
            name: displayName,
            description: description || '',
            color: color || '#0066CC',
            url: this.resolveUrl(baseUrl, href),
            ctag,
            supportsEvents: true,
          });
        }
      }
    }

    return calendars;
  }

  /**
   * Test CalDAV server connection
   */
  async testConnection(credentials: CalDAVCredentials): Promise<boolean> {
    try {
      const calendars = await this.discoverCalendars(credentials);
      return calendars.length > 0;
    } catch (error) {
      this.logger.error('CalDAV connection test failed:', error);
      return false;
    }
  }

  /**
   * Create a calendar event
   */
  async createEvent(
    credentials: CalDAVCredentials,
    calendarUrl: string,
    eventData: CalDAVCalendarEvent,
  ) {
    try {
      const { username, password } = credentials;
      const uid = eventData.uid || this.generateUID();
      const eventUrl = `${calendarUrl}${uid}.ics`;

      const icalData = this.buildICalEvent(eventData, uid);

      const response = await axios.request({
        method: 'PUT',
        url: eventUrl,
        auth: { username, password },
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'If-None-Match': '*', // Ensure we're creating, not updating
        },
        data: icalData,
      });

      this.logger.log(`Created CalDAV event: ${uid}`);

      return {
        uid,
        url: eventUrl,
        etag: response.headers.etag,
      };
    } catch (error) {
      this.logger.error('Failed to create CalDAV event:', error);
      throw new BadRequestException('Failed to create calendar event');
    }
  }

  /**
   * Update a calendar event
   */
  async updateEvent(
    credentials: CalDAVCredentials,
    eventUrl: string,
    eventData: CalDAVCalendarEvent,
    etag?: string,
  ) {
    try {
      const { username, password } = credentials;
      const uid = eventData.uid || this.extractUidFromUrl(eventUrl);

      const icalData = this.buildICalEvent(eventData, uid);

      const headers: any = {
        'Content-Type': 'text/calendar; charset=utf-8',
      };

      if (etag) {
        headers['If-Match'] = etag;
      }

      const response = await axios.request({
        method: 'PUT',
        url: eventUrl,
        auth: { username, password },
        headers,
        data: icalData,
      });

      this.logger.log(`Updated CalDAV event: ${uid}`);

      return {
        uid,
        etag: response.headers.etag,
      };
    } catch (error) {
      this.logger.error('Failed to update CalDAV event:', error);
      throw new BadRequestException('Failed to update calendar event');
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(credentials: CalDAVCredentials, eventUrl: string, etag?: string) {
    try {
      const { username, password } = credentials;

      const headers: any = {};
      if (etag) {
        headers['If-Match'] = etag;
      }

      await axios.request({
        method: 'DELETE',
        url: eventUrl,
        auth: { username, password },
        headers,
      });

      this.logger.log(`Deleted CalDAV event: ${eventUrl}`);

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to delete CalDAV event:', error);
      throw new BadRequestException('Failed to delete calendar event');
    }
  }

  /**
   * Get events for conflict detection
   */
  async getEvents(
    credentials: CalDAVCredentials,
    calendarUrl: string,
    startTime: string,
    endTime: string,
  ) {
    try {
      const { username, password } = credentials;

      const response = await axios.request({
        method: 'REPORT',
        url: calendarUrl,
        auth: { username, password },
        headers: {
          'Content-Type': 'application/xml',
          'Depth': '1',
        },
        data: `<?xml version="1.0" encoding="utf-8"?>
          <calendar-query xmlns="urn:ietf:params:xml:ns:caldav">
            <prop>
              <getetag/>
              <calendar-data/>
            </prop>
            <filter>
              <comp-filter name="VCALENDAR">
                <comp-filter name="VEVENT">
                  <time-range start="${this.formatCalDAVTime(startTime)}" end="${this.formatCalDAVTime(endTime)}"/>
                </comp-filter>
              </comp-filter>
            </filter>
          </calendar-query>`,
      });

      return this.parseEventsFromCalendarData(response.data);
    } catch (error) {
      this.logger.error('Failed to get CalDAV events:', error);
      throw new BadRequestException('Failed to retrieve calendar events');
    }
  }

  /**
   * Build iCal event data
   */
  private buildICalEvent(eventData: CalDAVCalendarEvent, uid: string): string {
    const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    let ical = 'BEGIN:VCALENDAR\r\n';
    ical += 'VERSION:2.0\r\n';
    ical += 'PRODID:-//SchedulePro//SchedulePro Calendar//EN\r\n';
    ical += 'CALSCALE:GREGORIAN\r\n';
    ical += 'BEGIN:VEVENT\r\n';
    ical += `UID:${uid}\r\n`;
    ical += `DTSTAMP:${now}\r\n`;
    ical += `DTSTART:${eventData.dtstart}\r\n`;
    ical += `DTEND:${eventData.dtend}\r\n`;
    ical += `SUMMARY:${this.escapeICalText(eventData.summary)}\r\n`;

    if (eventData.description) {
      ical += `DESCRIPTION:${this.escapeICalText(eventData.description)}\r\n`;
    }

    if (eventData.location) {
      ical += `LOCATION:${this.escapeICalText(eventData.location)}\r\n`;
    }

    if (eventData.organizer) {
      ical += `ORGANIZER;CN=${this.escapeICalText(eventData.organizer.name)}:mailto:${eventData.organizer.email}\r\n`;
    }

    if (eventData.attendees && eventData.attendees.length > 0) {
      eventData.attendees.forEach(attendee => {
        const status = attendee.status || 'NEEDS-ACTION';
        ical += `ATTENDEE;CN=${this.escapeICalText(attendee.name)};PARTSTAT=${status}:mailto:${attendee.email}\r\n`;
      });
    }

    if (eventData.categories && eventData.categories.length > 0) {
      ical += `CATEGORIES:${eventData.categories.join(',')}\r\n`;
    }

    if (eventData.priority) {
      ical += `PRIORITY:${eventData.priority}\r\n`;
    }

    if (eventData.transparency) {
      ical += `TRANSP:${eventData.transparency}\r\n`;
    }

    if (eventData.status) {
      ical += `STATUS:${eventData.status}\r\n`;
    }

    ical += 'END:VEVENT\r\n';
    ical += 'END:VCALENDAR\r\n';

    return ical;
  }

  /**
   * Utility methods
   */
  private generateUID(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@schedulepro.com`;
  }

  private extractUidFromUrl(url: string): string {
    const match = url.match(/([^\/]+)\.ics$/);
    return match ? match[1] : this.generateUID();
  }

  private resolveUrl(baseUrl: string, path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const relativePath = path.startsWith('/') ? path : `/${path}`;
    
    return `${base}${relativePath}`;
  }

  private extractXmlValue(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  private escapeICalText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  private formatCalDAVTime(isoString: string): string {
    return new Date(isoString).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  private parseEventsFromCalendarData(xmlData: string) {
    // Simplified parsing - in production, use a proper iCal parser
    const events = [];
    const calendarDataRegex = /<calendar-data[^>]*>(.*?)<\/calendar-data>/gs;
    let match;

    while ((match = calendarDataRegex.exec(xmlData)) !== null) {
      const icalData = match[1];
      
      // Extract basic event information
      const uid = this.extractICalProperty(icalData, 'UID');
      const summary = this.extractICalProperty(icalData, 'SUMMARY');
      const dtstart = this.extractICalProperty(icalData, 'DTSTART');
      const dtend = this.extractICalProperty(icalData, 'DTEND');
      const transp = this.extractICalProperty(icalData, 'TRANSP');

      if (uid && summary && dtstart && dtend) {
        // Skip transparent events (free time)
        if (transp && transp.toUpperCase() === 'TRANSPARENT') {
          continue;
        }

        events.push({
          uid,
          summary,
          dtstart,
          dtend,
          startTime: this.parseICalDateTime(dtstart),
          endTime: this.parseICalDateTime(dtend),
        });
      }
    }

    return events;
  }

  private extractICalProperty(icalData: string, property: string): string | null {
    const regex = new RegExp(`^${property}(?:;[^:]*)?:(.*)$`, 'm');
    const match = icalData.match(regex);
    return match ? match[1].trim() : null;
  }

  private parseICalDateTime(icalDateTime: string): Date {
    // Handle both local time and UTC formats
    if (icalDateTime.endsWith('Z')) {
      // UTC time
      const dateStr = icalDateTime.slice(0, -1);
      return new Date(
        parseInt(dateStr.substr(0, 4)), // year
        parseInt(dateStr.substr(4, 2)) - 1, // month (0-based)
        parseInt(dateStr.substr(6, 2)), // day
        parseInt(dateStr.substr(9, 2)), // hour
        parseInt(dateStr.substr(11, 2)), // minute
        parseInt(dateStr.substr(13, 2)) // second
      );
    } else {
      // Local time - assume UTC for simplicity
      return new Date(
        parseInt(icalDateTime.substr(0, 4)), // year
        parseInt(icalDateTime.substr(4, 2)) - 1, // month (0-based)
        parseInt(icalDateTime.substr(6, 2)), // day
        parseInt(icalDateTime.substr(9, 2)), // hour
        parseInt(icalDateTime.substr(11, 2)), // minute
        parseInt(icalDateTime.substr(13, 2)) // second
      );
    }
  }
}
