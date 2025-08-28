import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateMeetingTypeDto } from './dto/create-meeting-type.dto';
import { UpdateMeetingTypeDto } from './dto/update-meeting-type.dto';

@Injectable()
export class MeetingTypesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createMeetingTypeDto: CreateMeetingTypeDto) {
    console.log('DEBUG - create meeting type called with:', { userId, createMeetingTypeDto });
    
    try {
      // Verify user belongs to organization
      const membership = await this.prisma.organizationMember.findFirst({
        where: {
          userId,
          organizationId: createMeetingTypeDto.organizationId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
      });

      if (!membership) {
        throw new BadRequestException('You do not have permission to create meeting types for this organization');
      }

      console.log('DEBUG - membership verified:', membership);

      const createdMeetingType = await this.prisma.meetingType.create({
        data: {
          name: createMeetingTypeDto.name,
          description: createMeetingTypeDto.description,
          duration: createMeetingTypeDto.duration,
          organizationId: createMeetingTypeDto.organizationId,
          hostId: userId,
          isActive: createMeetingTypeDto.isActive ?? true,
        },
      });

      console.log('DEBUG - meeting type created:', createdMeetingType);
      return createdMeetingType;
    } catch (error) {
      console.error('ERROR - creating meeting type:', error);
      throw error;
    }
  }

  async findAll(userId: string, organizationId?: string) {
    console.log('DEBUG - findAll called with:', { userId, organizationId });
    
    // Get user's organization memberships
    const userMemberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });

    const userOrganizationIds = userMemberships.map(m => m.organizationId);
    console.log('DEBUG - user belongs to organizations:', userOrganizationIds);

    // If no organization access, return empty array
    if (userOrganizationIds.length === 0) {
      return [];
    }

    const where: any = {
      isActive: true,
      organizationId: { in: userOrganizationIds }, // Only show meeting types from user's organizations
    };

    // If specific organization requested, filter further
    if (organizationId) {
      // Ensure user has access to this organization
      if (!userOrganizationIds.includes(organizationId)) {
        throw new BadRequestException('You do not have access to this organization');
      }
      where.organizationId = organizationId;
    }

    console.log('DEBUG - findAll where clause:', where);

    const meetingTypes = await this.prisma.meetingType.findMany({
      where,
      include: {
        host: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { bookings: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log('DEBUG - found meeting types:', meetingTypes.length);
    return meetingTypes;
  }

  async findOne(id: string, userId: string) {
    console.log('DEBUG - findOne called with:', { id, userId });
    
    // Get user's organization memberships
    const userMemberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });

    const userOrganizationIds = userMemberships.map(m => m.organizationId);
    console.log('DEBUG - user belongs to organizations:', userOrganizationIds);

    const meetingType = await this.prisma.meetingType.findFirst({
      where: { 
        id, 
        organizationId: { in: userOrganizationIds }, // Only allow access to meeting types from user's organizations
      },
      include: {
        host: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
        bookings: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { startTime: 'asc' },
          take: 10,
        },
      },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found or you do not have access to it');
    }

    console.log('DEBUG - found meeting type:', meetingType.id);
    return meetingType;
  }

  async update(id: string, userId: string, updateMeetingTypeDto: UpdateMeetingTypeDto) {
    console.log('DEBUG - update called with:', { id, userId });

    // Get user's organization memberships
    const userMemberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });

    const userOrganizationIds = userMemberships.map(m => m.organizationId);
    console.log('DEBUG - user belongs to organizations:', userOrganizationIds);

    // First check if the meeting type exists and user has access to it
    const existingMeetingType = await this.prisma.meetingType.findFirst({
      where: { 
        id, 
        organizationId: { in: userOrganizationIds },
      },
    });

    if (!existingMeetingType) {
      throw new NotFoundException('Meeting type not found or you do not have access to it');
    }

    // Check if user is the host or has admin permissions in the organization
    if (existingMeetingType.hostId !== userId) {
      // For now, only allow the host to update. In future, could add org admin checks here
      throw new ForbiddenException('Only the host can update this meeting type');
    }

    console.log('DEBUG - updating meeting type:', id);
    return this.prisma.meetingType.update({
      where: { id },
      data: updateMeetingTypeDto,
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    console.log('DEBUG - remove called with:', { id, userId });

    // Get user's organization memberships
    const userMemberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });

    const userOrganizationIds = userMemberships.map(m => m.organizationId);
    console.log('DEBUG - user belongs to organizations:', userOrganizationIds);

    // First check if the meeting type exists and user has access to it
    const existingMeetingType = await this.prisma.meetingType.findFirst({
      where: { 
        id, 
        organizationId: { in: userOrganizationIds },
      },
    });

    if (!existingMeetingType) {
      throw new NotFoundException('Meeting type not found or you do not have access to it');
    }

    // Check if user is the host or has admin permissions in the organization
    if (existingMeetingType.hostId !== userId) {
      // For now, only allow the host to delete. In future, could add org admin checks here
      throw new ForbiddenException('Only the host can delete this meeting type');
    }

    // Check if there are upcoming bookings
    const upcomingBookings = await this.prisma.booking.count({
      where: {
        meetingTypeId: id,
        startTime: { gte: new Date() },
        status: { not: 'CANCELLED' },
      },
    });

    if (upcomingBookings > 0) {
      throw new BadRequestException('Cannot delete meeting type with upcoming bookings. Please cancel all bookings first.');
    }

    console.log('DEBUG - soft deleting meeting type:', id);
    // Soft delete by setting isActive to false
    return this.prisma.meetingType.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findByOrganizationAndId(organizationSlug: string, meetingTypeId: string) {
    return this.prisma.meetingType.findFirst({
      where: {
        id: meetingTypeId,
        isActive: true,
        organization: {
          slug: organizationSlug,
          isActive: true,
        },
      },
      include: {
        host: {
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true,
            timezone: true,
          },
        },
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }
}
