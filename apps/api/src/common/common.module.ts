import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TimezoneUtils } from './utils/timezone.utils';
import { EnhancedConflictDetectionService } from './services/enhanced-conflict-detection.service';
import { BookingValidationService } from './services/booking-validation.service';
import { SmartAvailabilityService } from './services/smart-availability.service';
import { BookingAnalyticsService } from './services/booking-analytics.service';
import { AutomatedNotificationsService } from './services/automated-notifications.service';
import { BookingMetricsService } from './services/booking-metrics.service';
import { EnhancedLoggingService } from './services/enhanced-logging.service';
import { SystemMonitoringService } from './services/system-monitoring.service';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

@Module({
  imports: [DatabaseModule],
  providers: [
    TimezoneUtils,
    EnhancedConflictDetectionService,
    BookingValidationService,
    SmartAvailabilityService,
    BookingAnalyticsService,
    AutomatedNotificationsService,
    BookingMetricsService,
    EnhancedLoggingService,
    SystemMonitoringService,
    GlobalExceptionFilter,
  ],
  exports: [
    TimezoneUtils,
    EnhancedConflictDetectionService,
    BookingValidationService,
    SmartAvailabilityService,
    BookingAnalyticsService,
    AutomatedNotificationsService,
    BookingMetricsService,
    EnhancedLoggingService,
    SystemMonitoringService,
    GlobalExceptionFilter,
  ],
})
export class CommonModule {}
