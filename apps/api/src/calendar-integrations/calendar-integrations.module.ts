import { Module } from '@nestjs/common';
import { CalendarIntegrationsService } from './calendar-integrations.service';
import { CalendarIntegrationsController } from './calendar-integrations.controller';
import { DatabaseModule } from '../database/database.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [DatabaseModule, CalendarModule],
  providers: [CalendarIntegrationsService],
  controllers: [CalendarIntegrationsController],
  exports: [CalendarIntegrationsService],
})
export class CalendarIntegrationsModule {}
