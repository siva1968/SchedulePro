import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MeetingTypesService } from './meeting-types.service';
import { CreateMeetingTypeDto, UpdateMeetingTypeDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('meeting-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meeting-types')
export class MeetingTypesController {
  constructor(private readonly meetingTypesService: MeetingTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new meeting type' })
  @ApiResponse({ status: 201, description: 'Meeting type created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req: any, @Body() createMeetingTypeDto: CreateMeetingTypeDto) {
    console.log('DEBUG - controller create called with req.user:', req.user);
    return this.meetingTypesService.create(req.user.id, createMeetingTypeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all meeting types for the user' })
  @ApiResponse({ status: 200, description: 'Meeting types retrieved successfully' })
  findAll(@Request() req: any, @Query('organizationId') organizationId?: string) {
    console.log('DEBUG - controller findAll called with req.user:', req.user);
    return this.meetingTypesService.findAll(req.user.id, organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific meeting type' })
  @ApiResponse({ status: 200, description: 'Meeting type retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Meeting type not found' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.meetingTypesService.findOne(id, req.user.id);
  }

  @Get(':id/meeting-provider-info')
  @ApiOperation({ summary: 'Get meeting provider information for a meeting type' })
  @ApiResponse({ status: 200, description: 'Meeting provider info retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Meeting type not found' })
  getMeetingProviderInfo(@Param('id') id: string, @Request() req: any) {
    return this.meetingTypesService.getMeetingProviderInfo(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a meeting type' })
  @ApiResponse({ status: 200, description: 'Meeting type updated successfully' })
  @ApiResponse({ status: 404, description: 'Meeting type not found' })
  update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateMeetingTypeDto: UpdateMeetingTypeDto,
  ) {
    return this.meetingTypesService.update(id, req.user.id, updateMeetingTypeDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a meeting type' })
  @ApiResponse({ status: 200, description: 'Meeting type deleted successfully' })
  @ApiResponse({ status: 404, description: 'Meeting type not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete meeting type with upcoming bookings' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.meetingTypesService.remove(id, req.user.id);
  }
}

// Public controller for booking pages
@ApiTags('public')
@Controller('public/meeting-types')
export class PublicMeetingTypesController {
  constructor(private readonly meetingTypesService: MeetingTypesService) {}

  @Get(':organizationSlug/:meetingTypeId')
  @ApiOperation({ summary: 'Get meeting type for public booking' })
  @ApiResponse({ status: 200, description: 'Meeting type retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Meeting type not found' })
  findByOrganizationAndId(
    @Param('organizationSlug') organizationSlug: string,
    @Param('meetingTypeId') meetingTypeId: string,
  ) {
    return this.meetingTypesService.findByOrganizationAndId(organizationSlug, meetingTypeId);
  }
}
