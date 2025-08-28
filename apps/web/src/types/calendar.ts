export enum CalendarProvider {
  GOOGLE = 'google',
  OUTLOOK = 'outlook',
  CALDAV = 'caldav',
}

export interface CalendarIntegration {
  id: string;
  userId: string;
  provider: CalendarProvider;
  name: string;
  description?: string;
  calendarId?: string;
  timezone?: string;
  isActive: boolean;
  syncEnabled?: boolean;
  conflictDetection?: boolean;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCalendarIntegrationRequest {
  provider: CalendarProvider;
  name: string;
  description?: string;
  accessToken: string;
  refreshToken?: string;
  calendarId?: string;
  syncEnabled?: boolean;
  conflictDetection?: boolean;
  timezone?: string;
}

export interface UpdateCalendarIntegrationRequest {
  name?: string;
  description?: string;
  accessToken?: string;
  refreshToken?: string;
  calendarId?: string;
  syncEnabled?: boolean;
  conflictDetection?: boolean;
  timezone?: string;
  isActive?: boolean;
}

export interface CalendarSyncResult {
  provider: string;
  success: boolean;
  eventId?: string;
  error?: string;
  message?: string;
}

export interface CalendarConflict {
  provider: string;
  eventTitle: string;
  startTime: string;
  endTime: string;
}
