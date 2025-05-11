import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesArgs } from '../decorators/roles.decorator';
import { ActionEnum, SubjectEnum } from '@prisma/client';

@Injectable()
export class RolesAndPermissionsGuard implements CanActivate {
  private readonly logger = new Logger(RolesAndPermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
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

      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (!user) {
        this.logger.warn('No user found in request');
        throw new ForbiddenException('User not found');
      }

      // Get tenantId from the current Prisma context (set by JWT strategy)
      const tenantId = user.tenantId;

      // Skip tenant check for super admin routes
      if (!tenantId && !requiredRoles.some(role => ['admin', 'super-admin'].includes(role))) {
        this.logger.warn('No tenant context found for non-admin route');
        throw new ForbiddenException('Tenant context is required');
      }

      // Get user's role in current tenant
      const userTenant = await this.getUserTenantRole(user.id, tenantId);

      if (!userTenant) {
        this.logger.warn(`User ${user.id} not found in tenant ${tenantId}`);
        throw new ForbiddenException('User does not have access to this tenant');
      }

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
        this.logger.warn(`Access denied for user ${user.id} in tenant ${tenantId}`);
        throw new ForbiddenException('Insufficient permissions');
      }

      return true;
    } catch (error) {
      this.logger.error('Error in RolesAndPermissionsGuard:', error);
      throw error;
    }
  }

  private async getUserTenantRole(userId: string, tenantId: string) {
    if (!tenantId) {
      throw new ForbiddenException('Tenant ID is required');
    }

    try {
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
        throw new ForbiddenException('User not found in tenant');
      }

      if (!userTenant.role) {
        throw new ForbiddenException('User has no role in tenant');
      }

      return userTenant;
    } catch (error) {
      this.logger.error(`Error fetching user tenant role: ${error.message}`);
      throw error;
    }
  }

  private async getUserPermissions(roleId: string): Promise<string[]> {
    try {
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
        include: { permissions: true },
      });

      if (!role) {
        throw new ForbiddenException('Role not found');
      }

      return role.permissions.map(
        (permission) => `${permission.action}:${permission.subject}`,
      );
    } catch (error) {
      this.logger.error(`Error fetching user permissions: ${error.message}`);
      throw error;
    }
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
    return requiredPermissions.every((required) =>
      userPermissions.includes(required),
    );
  }
}