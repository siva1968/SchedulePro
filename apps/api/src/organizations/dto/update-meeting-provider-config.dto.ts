import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsEnum, IsObject } from 'class-validator';

enum MeetingProvider {
  GOOGLE_MEET = 'GOOGLE_MEET',
  MICROSOFT_TEAMS = 'MICROSOFT_TEAMS',
  ZOOM = 'ZOOM',
  WEBEX = 'WEBEX',
  GOTOMEETING = 'GOTOMEETING',
  CUSTOM = 'CUSTOM',
}

export class UpdateMeetingProviderConfigDto {
  @ApiProperty({
    description: 'List of supported meeting providers for the organization',
    enum: MeetingProvider,
    isArray: true,
    example: ['GOOGLE_MEET', 'ZOOM', 'MICROSOFT_TEAMS'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(MeetingProvider, { each: true })
  supportedMeetingProviders?: MeetingProvider[];

  @ApiProperty({
    description: 'Default meeting provider for new meeting types',
    enum: MeetingProvider,
    example: 'GOOGLE_MEET',
    required: false,
  })
  @IsOptional()
  @IsEnum(MeetingProvider)
  defaultMeetingProvider?: MeetingProvider;

  @ApiProperty({
    description: 'Configuration settings for each meeting provider (API keys, URLs, etc.)',
    type: 'object',
    example: {
      ZOOM: {
        clientId: 'your-zoom-client-id',
        clientSecret: 'your-zoom-client-secret',
      },
      MICROSOFT_TEAMS: {
        tenantId: 'your-tenant-id',
        clientId: 'your-teams-client-id',
      },
    },
    required: false,
  })
  @IsOptional()
  @IsObject()
  meetingProviderConfigs?: Record<string, any>;
}
