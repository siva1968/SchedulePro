import { IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum OrganizationRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export class InviteMemberDto {
  @ApiProperty({
    description: 'Email of the user to invite',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Role to assign to the member',
    enum: OrganizationRole,
    example: OrganizationRole.MEMBER,
  })
  @IsEnum(OrganizationRole)
  role: OrganizationRole;
}
