import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SystemAdminGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Check if user has system admin role
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub || user.id },
      select: { systemRole: true }
    });

    if (!dbUser || (dbUser.systemRole !== 'ADMIN' && dbUser.systemRole !== 'SUPER_ADMIN')) {
      throw new ForbiddenException('System admin access required');
    }

    return true;
  }
}
