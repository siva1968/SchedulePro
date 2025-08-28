import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController, PublicBookingsController } from './bookings.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [BookingsService],
  controllers: [BookingsController, PublicBookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
