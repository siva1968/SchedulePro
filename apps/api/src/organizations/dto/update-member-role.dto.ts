import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrganizationRole } from './invite-member.dto';

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: 'New role for the member',
    enum: OrganizationRole,
    example: OrganizationRole.ADMIN,
  })
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
