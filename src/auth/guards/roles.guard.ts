import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { User } from '../interface/user.interface';
import { MESSAGES } from '../../constants';
import { RolesArgs } from '../decorators/roles.decorator';
import { ActionEnum, SubjectEnum } from '@prisma/client';

@Injectable()
export class RolesAndPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Retrieve roles and permissions metadata
    const rolesDecoratorValues = this.reflector.get<RolesArgs>(
      'roles',
      context.getHandler(),
    );
    const requiredRoles = rolesDecoratorValues?.roles || [];
    const requiredPermissions = rolesDecoratorValues?.permissions || [];

    // If no roles or permissions are required, allow access
    if (!requiredRoles.length && !requiredPermissions.length) {
      return true;
    }

    // Get request and user
    const request = context.switchToHttp().getRequest();
    const user = request.user as User;
    console.warn(user)

    if (!user) {
      throw new ForbiddenException(MESSAGES.USER_NOT_FOUND);
    }

    // Get tenantId from request (set by middleware)
    // const tenantId = request['tenantId'];


    // const tenantId = request['tenantId'];
    const tenantId = this.prisma.currentTenantId;
    console.warn(tenantId + "role 1")


    // this.prisma.setCurrentTenant(payload.tenantId);

    // For routes that don't require tenant context (like global admin routes)
    if (!tenantId && !requiredRoles.some(role => ['admin', 'super-admin'].includes(role))) {
      throw new ForbiddenException("Tenant is required Role 1");
    }

    // Get user's role in current tenant
    const userTenant = await this.getUserTenantRole(user.id, tenantId);

    // Allow admin and super-admin users to bypass checks
    if (['admin', 'super-admin'].includes(userTenant.role.role)) {
      return true;
    }

    // Check roles
    const hasRequiredRoles = requiredRoles.length
      ? requiredRoles.includes(userTenant.role.role)
      : true;

    // Check permissions
    const userPermissions = await this.getUserPermissions(userTenant.roleId);
    const hasRequiredPermissions = requiredPermissions.length
      ? this.checkPermissions(userPermissions, requiredPermissions)
      : true;

    if (!(hasRequiredRoles && hasRequiredPermissions)) {
      throw new ForbiddenException(MESSAGES.NOT_PERMITTED);
    }

    return true;
  }

  private async getUserTenantRole(userId: string, tenantId: string) {
    if (!tenantId) {
      throw new ForbiddenException(MESSAGES.TENANT_ID_REQUIRED);
    }

    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      include: {
        role: true,
      },
    });

    if (!userTenant) {
      throw new ForbiddenException(MESSAGES.TENANT_NOT_FOUND);
    }

    if (!userTenant.role) {
      throw new ForbiddenException(MESSAGES.ROLE_NOT_FOUND);
    }

    return userTenant;
  }

  private async getUserPermissions(roleId: string): Promise<string[]> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });

    if (!role) {
      throw new ForbiddenException(MESSAGES.ROLE_NOT_FOUND);
    }

    return role.permissions.map(
      (permission) => `${permission.action}:${permission.subject}`,
    );
  }

  private checkPermissions(
    userPermissions: string[],
    requiredPermissions: string[],
  ): boolean {
    // Check if user has any permission with subject 'all' and action 'manage'
    const hasGlobalPermission = userPermissions.some(
      (perm) => perm === `${ActionEnum.manage}:${SubjectEnum.all}`,
    );

    if (hasGlobalPermission) {
      return true;
    }

    // Check if user has all required permissions
    return requiredPermissions.some((required) =>
      userPermissions.includes(required),
    );
  }
}