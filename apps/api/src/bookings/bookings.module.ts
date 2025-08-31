import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController, PublicBookingsController } from './bookings.controller';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { CalendarModule } from '../calendar/calendar.module';
import { EnhancedConflictDetectionService } from '../common/services/enhanced-conflict-detection.service';
import { BookingValidationService } from '../common/services/booking-validation.service';
import { SmartAvailabilityService } from '../common/services/smart-availability.service';
import { BookingAnalyticsService } from '../common/services/booking-analytics.service';
import { AutomatedNotificationsService } from '../common/services/automated-notifications.service';
import { BookingMetricsService } from '../common/services/booking-metrics.service';
import { EnhancedLoggingService } from '../common/services/enhanced-logging.service';
import { SystemMonitoringService } from '../common/services/system-monitoring.service';
import { MonitoringController } from '../common/controllers/monitoring.controller';
import { TimezoneUtils } from '../common/utils/timezone.utils';

@Module({
  imports: [DatabaseModule, EmailModule, CalendarModule],
  providers: [
    BookingsService,
    EnhancedConflictDetectionService,
    BookingValidationService,
    SmartAvailabilityService,
    BookingAnalyticsService,
    AutomatedNotificationsService,
    BookingMetricsService,
    EnhancedLoggingService,
    SystemMonitoringService,
    TimezoneUtils,
  ],
  controllers: [BookingsController, PublicBookingsController, MonitoringController],
  exports: [
    BookingsService,
    EnhancedConflictDetectionService,
    BookingValidationService,
    SmartAvailabilityService,
    BookingAnalyticsService,
    AutomatedNotificationsService,
    BookingMetricsService,
    EnhancedLoggingService,
    SystemMonitoringService,
    TimezoneUtils,
  ],
})
export class BookingsModule {}
