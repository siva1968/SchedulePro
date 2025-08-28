import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto, UpdateAvailabilityDto, AvailabilityQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  @ApiOperation({ summary: 'Create availability slot' })
  @ApiResponse({ status: 201, description: 'Availability slot created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'Availability slot conflict' })
  create(@Body() createAvailabilityDto: CreateAvailabilityDto, @Req() req: any) {
    return this.availabilityService.create(createAvailabilityDto, req.user.id);
  }

  @Post('weekly')
  @ApiOperation({ summary: 'Create weekly availability schedule' })
  @ApiResponse({ status: 201, description: 'Weekly schedule created successfully' })
  bulkCreateWeekly(
    @Body() weeklySchedule: Array<{
      dayOfWeek: number;
      startTime: string;
      endTime: string;
    }>,
    @Req() req: any,
  ) {
    return this.availabilityService.bulkCreateWeeklyAvailability(req.user.id, weeklySchedule);
  }

  @Get()
  @ApiOperation({ summary: 'Get availability slots' })
  @ApiResponse({ status: 200, description: 'Availability slots retrieved successfully' })
  findAll(@Query() query: AvailabilityQueryDto, @Req() req: any) {
    return this.availabilityService.findAll(query, req.user.id);
  }

  @Get('slots')
  @ApiOperation({ summary: 'Get available time slots for booking' })
  @ApiResponse({ status: 200, description: 'Available slots retrieved successfully' })
  getAvailableSlots(
    @Query('date') date: string,
    @Query('duration') duration: string,
    @Query('bufferTime') bufferTime: string = '0',
    @Req() req: any,
  ) {
    return this.availabilityService.getAvailableSlots(
      req.user.id,
      date,
      parseInt(duration),
      parseInt(bufferTime),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific availability slot' })
  @ApiResponse({ status: 200, description: 'Availability slot retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Availability slot not found' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.availabilityService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update availability slot' })
  @ApiResponse({ status: 200, description: 'Availability slot updated successfully' })
  @ApiResponse({ status: 404, description: 'Availability slot not found' })
  @ApiResponse({ status: 409, description: 'Availability slot conflict' })
  update(
    @Param('id') id: string,
    @Body() updateAvailabilityDto: UpdateAvailabilityDto,
    @Req() req: any,
  ) {
    return this.availabilityService.update(id, updateAvailabilityDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete availability slot' })
  @ApiResponse({ status: 200, description: 'Availability slot deleted successfully' })
  @ApiResponse({ status: 404, description: 'Availability slot not found' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.availabilityService.remove(id, req.user.id);
  }
}
