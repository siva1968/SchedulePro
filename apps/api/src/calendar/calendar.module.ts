import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { CalendarOAuthController } from './calendar-oauth.controller';
import { CalendarSyncController } from './calendar-sync.controller';
import { CalendarWebhookController } from './calendar-webhook.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { OutlookCalendarService } from './outlook-calendar.service';
import { CalDAVService } from './caldav.service';
import { EncryptionService } from './encryption.service';
import { ConflictDetectionService } from './conflict-detection.service';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { MicrosoftOAuthService } from '../auth/oauth/microsoft-oauth.service';
import { ZoomOAuthService } from './services/zoom-oauth.service';

@Module({
  imports: [DatabaseModule, ConfigModule, AuthModule],
  controllers: [
    CalendarController, 
    CalendarOAuthController, 
    CalendarSyncController,
    CalendarWebhookController,
  ],
  providers: [
    CalendarService, 
    GoogleCalendarService, 
    OutlookCalendarService,
    CalDAVService,
    EncryptionService,
    ConflictDetectionService,
    MicrosoftOAuthService,
    ZoomOAuthService,
  ],
  exports: [
    CalendarService, 
    GoogleCalendarService, 
    OutlookCalendarService,
    CalDAVService,
    EncryptionService,
    ConflictDetectionService,
    ZoomOAuthService,
  ],
})
export class CalendarModule {}
