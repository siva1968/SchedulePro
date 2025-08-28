import { Module } from '@nestjs/common';
import { MeetingTypesService } from './meeting-types.service';
import { MeetingTypesController, PublicMeetingTypesController } from './meeting-types.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MeetingTypesController, PublicMeetingTypesController],
  providers: [MeetingTypesService],
  exports: [MeetingTypesService],
})
export class MeetingTypesModule {}
