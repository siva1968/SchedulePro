import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController, PublicBookingsController } from './bookings.controller';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [DatabaseModule, EmailModule, CalendarModule],
  providers: [BookingsService],
  controllers: [BookingsController, PublicBookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
