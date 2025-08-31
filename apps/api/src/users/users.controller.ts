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
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
  @UseGuards(SystemAdminGuard) // Only system admins can create users
  @Throttle(5, 300) // 5 user creations per 5 minutes
  @ApiOperation({ summary: 'Create a new user (System Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or email already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System Admin access required',
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @UseGuards(SystemAdminGuard) // Only system admins can view all users
  @ApiOperation({ summary: 'Get all users (System Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'List of all users',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System Admin access required',
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden - can only access own profile',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    // Allow users to access their own profile or system admins to access any profile
    const currentUserId = req.user.sub || req.user.id;
    const isSystemAdmin = req.user.role === 'SYSTEM_ADMIN';
    
    if (id !== currentUserId && !isSystemAdmin) {
      throw new ForbiddenException('You can only access your own profile');
    }
    
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden - can only access own availability',
  })
  getUserAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: any,
  ) {
    // Allow users to access their own availability or system admins to access any availability
    const currentUserId = req.user.sub || req.user.id;
    const isSystemAdmin = req.user.role === 'SYSTEM_ADMIN';
    
    if (id !== currentUserId && !isSystemAdmin) {
      throw new ForbiddenException('You can only access your own availability');
    }
    
    return this.usersService.getUserAvailability(
      id,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Patch(':id')
  @Throttle(10, 300) // 10 updates per 5 minutes
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden - can only update own profile',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ) {
    // Allow users to update their own profile or system admins to update any profile
    const currentUserId = req.user.sub || req.user.id;
    const isSystemAdmin = req.user.role === 'SYSTEM_ADMIN';
    
    if (id !== currentUserId && !isSystemAdmin) {
      throw new ForbiddenException('You can only update your own profile');
    }
    
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/change-password')
  @Throttle(5, 300) // 5 password changes per 5 minutes
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
  @ApiResponse({
    status: 403,
    description: 'Forbidden - can only change own password',
  })
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: any,
  ) {
    // Allow users to change their own password or system admins to change any password
    const currentUserId = req.user.sub || req.user.id;
    const isSystemAdmin = req.user.role === 'SYSTEM_ADMIN';
    
    if (id !== currentUserId && !isSystemAdmin) {
      throw new ForbiddenException('You can only change your own password');
    }
    
    return this.usersService.changePassword(
      id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard) // Only system admins can delete users
  @ApiOperation({ summary: 'Soft delete user (deactivate) - System Admin only' })
  @ApiResponse({
    status: 200,
    description: 'User successfully deactivated',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - System Admin access required',
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
