import { SetMetadata } from '@nestjs/common';

export const RequireOrganization = (organizationId: string) =>
  SetMetadata('organizationId', organizationId);

export const Public = () => SetMetadata('isPublic', true);
