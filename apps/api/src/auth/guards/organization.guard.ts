import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredOrganizationId = this.reflector.get<string>(
      'organizationId',
      context.getHandler(),
    );

    if (!requiredOrganizationId) {
      return true; // No organization requirement
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.organizations) {
      throw new ForbiddenException('User not authenticated');
    }

    const hasAccess = user.organizations.some(
      (org: any) => org.id === requiredOrganizationId,
    );

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this organization');
    }

    return true;
  }
}
