import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum MeetingProvider {
  GOOGLE_MEET = 'GOOGLE_MEET',
  MICROSOFT_TEAMS = 'MICROSOFT_TEAMS',
  ZOOM = 'ZOOM',
}

export class ApproveBookingDto {
  @ApiPropertyOptional({
    enum: MeetingProvider,
    description: 'Meeting provider to use for the approved booking',
    example: MeetingProvider.GOOGLE_MEET,
  })
  @IsOptional()
  @IsEnum(MeetingProvider)
  meetingProvider?: MeetingProvider;
}
