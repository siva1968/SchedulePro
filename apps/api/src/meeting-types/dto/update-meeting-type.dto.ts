import { PartialType } from '@nestjs/swagger';
import { CreateMeetingTypeDto } from './create-meeting-type.dto';

export class UpdateMeetingTypeDto extends PartialType(CreateMeetingTypeDto) {}
