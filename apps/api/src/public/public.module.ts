import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { DatabaseModule } from '../database/database.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [DatabaseModule, BookingsModule],
  controllers: [PublicController],
})
export class PublicModule {}
