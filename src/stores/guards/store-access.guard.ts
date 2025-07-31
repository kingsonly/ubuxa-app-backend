import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { StoreRolesService } from '../store-roles.service';
import { TenantContext } from '../../tenants/context/tenant.context';
import { StoreContext } from '../context/store.context';

/**
 * Guard that checks if user has any access to a store
 * This is a simpler check than StorePermissionGuard - just verifies store access
 */
@Injectable()
export class StoreAccessGuard implements CanActivate {
  constructor(
    private storeRolesService: StoreRolesService,
    private tenantContext: TenantContext,
    private storeContext: StoreContext
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    
    if (request.params.storeId) {
      storeId = request.params.storeId;
    } else if (request.params.id) {
      // Sometimes store ID might be in 'id' parameter
      storeId = request.params.id;
    } else {
      // Try to get from store context
      try {
        storeId = await this.storeContext.requireStoreId();
      } catch (error) {
        console.warn('store-access.guard line 44 error',error)
        throw new ForbiddenException('Store context not found');
      }
    }

    // Get user's store access
    const userAccess = await this.storeRolesService.getUserStoreAccess(
      { userId: user.sub, storeId },
      { tenantId }
    );

    // Check if user is tenant super admin (has access to all stores)
    if (userAccess.isTenantSuperAdmin) {
      return true;
    }

    // Check if user has specific access to this store
    const hasStoreAccess = userAccess.userStoreRoles.some(
      role => role.store.id === storeId && role.isActive
    );

    if (!hasStoreAccess) {
      throw new ForbiddenException(`Access denied to store ${storeId}`);
    }

    return true;
  }
}

/**
 * Decorator to require store access
 */
export const RequireStoreAccess = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    // This decorator just marks that StoreAccessGuard should be used
    // The actual guard application happens in the controller
  };
};