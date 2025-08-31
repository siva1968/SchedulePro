import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CalendarIntegrationsService, CreateCalendarIntegrationDto, UpdateCalendarIntegrationDto } from './calendar-integrations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('calendar-integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('calendar-integrations')
export class CalendarIntegrationsController {
  constructor(private readonly calendarIntegrationsService: CalendarIntegrationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new calendar integration' })
  @ApiResponse({ status: 201, description: 'Calendar integration created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or invalid credentials' })
  @ApiResponse({ status: 409, description: 'Calendar integration already exists for this provider' })
  async create(
    @Body() createDto: CreateCalendarIntegrationDto,
    @Req() req: any,
  ) {
    return this.calendarIntegrationsService.create(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all calendar integrations for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Calendar integrations retrieved successfully' })
  async findAll(@Req() req: any) {
    return this.calendarIntegrationsService.findAllByUser(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific calendar integration' })
  @ApiResponse({ status: 200, description: 'Calendar integration retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.calendarIntegrationsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a calendar integration' })
  @ApiResponse({ status: 200, description: 'Calendar integration updated successfully' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCalendarIntegrationDto,
    @Req() req: any,
  ) {
    return this.calendarIntegrationsService.update(id, req.user.id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a calendar integration' })
  @ApiResponse({ status: 204, description: 'Calendar integration deleted successfully' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.calendarIntegrationsService.remove(id, req.user.id);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Manually sync calendar events for an integration' })
  @ApiResponse({ status: 200, description: 'Calendar sync completed' })
  @ApiResponse({ status: 400, description: 'Integration not active or sync disabled' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async syncCalendar(@Param('id') id: string, @Req() req: any) {
    return this.calendarIntegrationsService.syncCalendar(id, req.user.id);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get integration status and health check' })
  @ApiResponse({ status: 200, description: 'Integration status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async getStatus(@Param('id') id: string, @Req() req: any) {
    return this.calendarIntegrationsService.getIntegrationStatus(id, req.user.id);
  }

  @Post(':id/test-connection')
  @ApiOperation({ summary: 'Test connection for a calendar integration' })
  @ApiResponse({ status: 200, description: 'Connection test completed' })
  @ApiResponse({ status: 404, description: 'Calendar integration not found' })
  async testConnection(@Param('id') id: string, @Req() req: any) {
    return this.calendarIntegrationsService.testConnection(id, req.user.id);
  }
}
