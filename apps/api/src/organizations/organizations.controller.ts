import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  UpdateMeetingProviderConfigDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  @ApiResponse({
    status: 201,
    description: 'Organization successfully created',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors or name already taken',
  })
  create(
    @Body() createOrganizationDto: CreateOrganizationDto,
    @CurrentUser() user: any,
  ) {
    return this.organizationsService.create(createOrganizationDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all organizations for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of user organizations',
  })
  findAll(@CurrentUser() user: any) {
    return this.organizationsService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiResponse({
    status: 200,
    description: 'Organization details',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.organizationsService.findOne(id, user.id);
  }

  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get organization by slug (public)' })
  @ApiResponse({
    status: 200,
    description: 'Organization details',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  findBySlug(@Param('slug') slug: string, @CurrentUser() user?: any) {
    return this.organizationsService.findBySlug(slug, user?.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organization' })
  @ApiResponse({
    status: 200,
    description: 'Organization successfully updated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
    @CurrentUser() user: any,
  ) {
    return this.organizationsService.update(id, updateOrganizationDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete organization' })
  @ApiResponse({
    status: 200,
    description: 'Organization successfully deleted',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only owner can delete organization',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.organizationsService.remove(id, user.id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Invite member to organization' })
  @ApiResponse({
    status: 201,
    description: 'Member successfully invited',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 400,
    description: 'User already a member',
  })
  inviteMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() inviteMemberDto: InviteMemberDto,
    @CurrentUser() user: any,
  ) {
    return this.organizationsService.inviteMember(id, inviteMemberDto, user.id);
  }

  @Patch(':id/members/:memberId/role')
  @ApiOperation({ summary: 'Update member role' })
  @ApiResponse({
    status: 200,
    description: 'Member role successfully updated',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Member not found',
  })
  updateMemberRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.organizationsService.updateMemberRole(
      id,
      memberId,
      updateMemberRoleDto,
      user.id,
    );
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove member from organization' })
  @ApiResponse({
    status: 200,
    description: 'Member successfully removed',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions or cannot remove owner',
  })
  @ApiResponse({
    status: 404,
    description: 'Member not found',
  })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser() user: any,
  ) {
    return this.organizationsService.removeMember(id, memberId, user.id);
  }

  @Get(':id/meeting-providers')
  @ApiOperation({ summary: 'Get organization meeting provider configuration' })
  @ApiResponse({
    status: 200,
    description: 'Meeting provider configuration retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  getMeetingProviderConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.organizationsService.getMeetingProviderConfig(id, user.id);
  }

  @Patch(':id/meeting-providers')
  @ApiOperation({ summary: 'Update organization meeting provider configuration' })
  @ApiResponse({
    status: 200,
    description: 'Meeting provider configuration updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation errors',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions',
  })
  @ApiResponse({
    status: 404,
    description: 'Organization not found',
  })
  updateMeetingProviderConfig(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateData: UpdateMeetingProviderConfigDto,
    @CurrentUser() user: any,
  ) {
    return this.organizationsService.updateMeetingProviderConfig(id, updateData, user.id);
  }
}
