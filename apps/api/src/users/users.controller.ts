import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ChangePasswordDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { SystemAdminGuard } from '../auth/guards/system-admin.guard';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or email already exists',
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({
    status: 200,
    description: 'List of all users',
  })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({
    status: 200,
    description: 'User details',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/availability')
  @ApiOperation({ summary: 'Get user availability for date range' })
  @ApiQuery({
    name: 'startDate',
    type: String,
    description: 'Start date (ISO 8601)',
    example: '2024-01-01T00:00:00Z',
  })
  @ApiQuery({
    name: 'endDate',
    type: String,
    description: 'End date (ISO 8601)',
    example: '2024-01-31T23:59:59Z',
  })
  @ApiResponse({
    status: 200,
    description: 'User availability data',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  getUserAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.usersService.getUserAvailability(
      id,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({
    status: 200,
    description: 'User successfully updated',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or email already taken',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/change-password')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({
    status: 200,
    description: 'Password successfully changed',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - current password incorrect or validation errors',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete user (deactivate)' })
  @ApiResponse({
    status: 200,
    description: 'User successfully deactivated',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  // Admin-only endpoints
  @Patch(':id/role')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({ summary: 'Update user system role (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User role successfully updated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin privileges required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { systemRole: 'USER' | 'ADMIN' | 'SUPER_ADMIN' },
  ) {
    return this.usersService.updateUserRole(id, body.systemRole);
  }

  @Patch(':id/status')
  @UseGuards(SystemAdminGuard)
  @ApiOperation({ summary: 'Update user active status (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'User status successfully updated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin privileges required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.usersService.updateUserStatus(id, body.isActive);
  }

  @Delete(':id/hard')
  @ApiOperation({ summary: 'Permanently delete user' })
  @ApiResponse({
    status: 200,
    description: 'User permanently deleted',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.hardDelete(id);
  }
}
