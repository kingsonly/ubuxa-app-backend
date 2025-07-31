import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StoreRolesService } from '../store-roles.service';
import { TenantContext } from '../../tenants/context/tenant.context';
import { StoreContext } from '../context/store.context';

// Decorator for store permissions
export const STORE_PERMISSIONS_KEY = 'store_permissions';

export interface StorePermissionRequirement {
  action: string;
  subject: string;
  storeIdParam?: string; // Parameter name to extract store ID from (default: 'storeId')
}

export const RequireStorePermission = (
  action: string,
  subject: string,
  storeIdParam: string = 'storeId'
) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(
      STORE_PERMISSIONS_KEY,
      { action, subject, storeIdParam },
      descriptor.value
    );
  };
};

@Injectable()
export class StorePermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private storeRolesService: StoreRolesService,
    private tenantContext: TenantContext,
    private storeContext: StoreContext
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.get<StorePermissionRequirement>(
      STORE_PERMISSIONS_KEY,
      context.getHandler()
    );

    if (!requirement) {
      // No store permission requirement, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not found');
    }

    // Extract store ID from request parameters or context
    let storeId: string;
    
    if (requirement.storeIdParam && request.params[requirement.storeIdParam]) {
      storeId = request.params[requirement.storeIdParam];
    } else {
      // Try to get from store context
      try {
        storeId = await this.storeContext.requireStoreId();
      } catch (error) {
        console.warn('store-permission.guard line: 72', error)
        throw new ForbiddenException('Store context not found');
      }
    }

    // Check if user has the required permission for this store
    const hasPermission = await this.storeRolesService.checkUserStorePermission(
      user.sub, // User ID from JWT
      storeId,
      requirement.action,
      requirement.subject,
      { tenantId }
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requirement.action}:${requirement.subject} for store ${storeId}`
      );
    }

    return true;
  }
}

// Convenience decorators for common permissions
export const RequireStoreAdmin = (storeIdParam: string = 'storeId') =>
  RequireStorePermission('manage', 'Store', storeIdParam);

export const RequireStoreInventoryAccess = (storeIdParam: string = 'storeId') =>
  RequireStorePermission('read', 'StoreInventory', storeIdParam);

export const RequireStoreInventoryManage = (storeIdParam: string = 'storeId') =>
  RequireStorePermission('manage', 'StoreInventory', storeIdParam);

export const RequireStoreTransferAccess = (storeIdParam: string = 'storeId') =>
  RequireStorePermission('transfer', 'StoreTransfer', storeIdParam);

export const RequireStoreReportAccess = (storeIdParam: string = 'storeId') =>
  RequireStorePermission('read', 'Reports', storeIdParam);