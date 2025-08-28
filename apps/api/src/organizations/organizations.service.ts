import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateMeetingProviderConfigDto } from './dto/update-meeting-provider-config.dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(createOrganizationDto: CreateOrganizationDto, ownerId: string) {
    // Generate slug from name
    const slug = this.generateSlug(createOrganizationDto.name);

    // Check if slug is already taken
    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug },
    });

    if (existingOrg) {
      throw new BadRequestException('Organization name already taken');
    }

    // Create organization and add owner as member in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: createOrganizationDto.name,
          slug,
          description: createOrganizationDto.description,
          website: createOrganizationDto.website,
          ownerId,
        },
      });

      // Add owner as organization member
      await tx.organizationMember.create({
        data: {
          userId: ownerId,
          organizationId: organization.id,
          role: 'OWNER',
        },
      });

      return organization;
    });

    return result;
  }

  async findAll(userId: string) {
    const organizations = await this.prisma.organization.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        _count: {
          select: {
            members: true,
            meetingTypes: true,
          },
        },
        members: {
          where: {
            userId,
          },
          select: {
            role: true,
          },
        },
      },
    });

    return organizations.map((org) => ({
      ...org,
      userRole: org.members[0]?.role,
      members: undefined, // Remove members from response
    }));
  }

  async findOne(id: string, userId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                profileImageUrl: true,
              },
            },
          },
        },
        meetingTypes: {
          select: {
            id: true,
            name: true,
            duration: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            meetingTypes: true,
            members: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }

    const userMember = organization.members.find((member) => member.userId === userId);

    return {
      ...organization,
      userRole: userMember?.role,
    };
  }

  async findBySlug(slug: string, userId?: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { slug },
      include: {
        meetingTypes: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            description: true,
            duration: true,
            price: true,
          },
        },
        members: userId
          ? {
              where: {
                userId,
              },
              select: {
                role: true,
              },
            }
          : false,
      },
    });

    if (!organization) {
      throw new NotFoundException(`Organization with slug ${slug} not found`);
    }

    return {
      ...organization,
      userRole: userId && organization.members ? organization.members[0]?.role : null,
      members: undefined, // Remove members from public response
    };
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto, userId: string) {
    // Check if user has permission to update
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId: id,
        userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!member) {
      throw new ForbiddenException('You do not have permission to update this organization');
    }

    // Generate new slug if name is being updated
    let slug: string | undefined;
    if (updateOrganizationDto.name) {
      slug = this.generateSlug(updateOrganizationDto.name);

      // Check if new slug is already taken (excluding current organization)
      const existingOrg = await this.prisma.organization.findFirst({
        where: {
          slug,
          id: { not: id },
        },
      });

      if (existingOrg) {
        throw new BadRequestException('Organization name already taken');
      }
    }

    const updatedOrganization = await this.prisma.organization.update({
      where: { id },
      data: {
        ...updateOrganizationDto,
        ...(slug && { slug }),
      },
    });

    return updatedOrganization;
  }

  async remove(id: string, userId: string) {
    // Check if user is the owner
    const organization = await this.prisma.organization.findFirst({
      where: {
        id,
        ownerId: userId,
      },
    });

    if (!organization) {
      throw new ForbiddenException('Only the organization owner can delete the organization');
    }

    // Delete organization (cascade will handle related records)
    await this.prisma.organization.delete({
      where: { id },
    });

    return { message: 'Organization successfully deleted' };
  }

  async inviteMember(organizationId: string, inviteMemberDto: InviteMemberDto, inviterId: string) {
    // Check if inviter has permission
    const inviterMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: inviterId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!inviterMember) {
      throw new ForbiddenException('You do not have permission to invite members');
    }

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email: inviteMemberDto.email },
    });

    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    // Check if user is already a member
    const existingMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: user.id,
      },
    });

    if (existingMember) {
      throw new BadRequestException('User is already a member of this organization');
    }

    // Add user as member
    const newMember = await this.prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId,
        role: inviteMemberDto.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
      },
    });

    return newMember;
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    updateMemberRoleDto: UpdateMemberRoleDto,
    updaterId: string,
  ) {
    // Check if updater has permission
    const updaterMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: updaterId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!updaterMember) {
      throw new ForbiddenException('You do not have permission to update member roles');
    }

    // Cannot change owner role or update to owner unless you are the owner
    const targetMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: memberId,
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    if (targetMember.role === 'OWNER' || updateMemberRoleDto.role === 'OWNER') {
      if (updaterMember.role !== 'OWNER') {
        throw new ForbiddenException('Only organization owner can change owner role');
      }
    }

    const updatedMember = await this.prisma.organizationMember.update({
      where: {
        userId_organizationId: {
          userId: memberId,
          organizationId,
        },
      },
      data: {
        role: updateMemberRoleDto.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            profileImageUrl: true,
          },
        },
      },
    });

    return updatedMember;
  }

  async removeMember(organizationId: string, memberId: string, removerId: string) {
    // Check if remover has permission
    const removerMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: removerId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!removerMember) {
      throw new ForbiddenException('You do not have permission to remove members');
    }

    // Cannot remove owner
    const targetMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId: memberId,
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }

    if (targetMember.role === 'OWNER') {
      throw new ForbiddenException('Cannot remove organization owner');
    }

    await this.prisma.organizationMember.delete({
      where: {
        userId_organizationId: {
          userId: memberId,
          organizationId,
        },
      },
    });

    return { message: 'Member successfully removed' };
  }

  async getMeetingProviderConfig(organizationId: string, userId: string) {
    // Check if user has permission to view organization settings
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!member) {
      throw new ForbiddenException('You do not have permission to view organization settings');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        supportedMeetingProviders: true,
        defaultMeetingProvider: true,
        meetingProviderConfigs: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      supportedMeetingProviders: organization.supportedMeetingProviders,
      defaultMeetingProvider: organization.defaultMeetingProvider,
      meetingProviderConfigs: organization.meetingProviderConfigs,
    };
  }

  async updateMeetingProviderConfig(
    organizationId: string,
    updateData: UpdateMeetingProviderConfigDto,
    userId: string,
  ) {
    // Check if user has permission to update organization settings
    const member = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!member) {
      throw new ForbiddenException('You do not have permission to update organization settings');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Validate that default provider is in supported providers list
    if (
      updateData.defaultMeetingProvider &&
      updateData.supportedMeetingProviders &&
      !updateData.supportedMeetingProviders.includes(updateData.defaultMeetingProvider)
    ) {
      throw new BadRequestException('Default meeting provider must be in the supported providers list');
    }

    const updatedOrganization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(updateData.supportedMeetingProviders && {
          supportedMeetingProviders: updateData.supportedMeetingProviders,
        }),
        ...(updateData.defaultMeetingProvider && {
          defaultMeetingProvider: updateData.defaultMeetingProvider,
        }),
        ...(updateData.meetingProviderConfigs && {
          meetingProviderConfigs: updateData.meetingProviderConfigs,
        }),
      },
      select: {
        id: true,
        supportedMeetingProviders: true,
        defaultMeetingProvider: true,
        meetingProviderConfigs: true,
      },
    });

    return updatedOrganization;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}
