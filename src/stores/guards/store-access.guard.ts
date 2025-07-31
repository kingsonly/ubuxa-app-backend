import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StoreRolesService } from '../store-roles.service';
import { TenantContext } from '../../tenants/context/tenant.context';
import { StoreContext } from '../context/store.context';

// Metadata key for store access requirements
export const STORE_ACCESS_KEY = 'store_access';

export interface StoreAccessRequirement {
  storeIdParam?: string; // Parameter name to extract store ID from (default: 'storeId')
  allowTenantSuperAdmin?: boolean; // Whether tenant super admin bypasses store-specific access (default: true)
  requireActiveRole?: boolean; // Whether to require active role assignment (default: true)
  fallbackToContext?: boolean; // Whether to fallback to store context if no param found (default: true)
}

/**
 * Decorator to require store access
 * @param options Configuration options for store access requirements
 */
export const RequireStoreAccess = (options: StoreAccessRequirement = {}) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const defaultOptions: StoreAccessRequirement = {
      storeIdParam: 'storeId',
      allowTenantSuperAdmin: true,
      requireActiveRole: true,
      fallbackToContext: true,
      ...options
    };

    Reflect.defineMetadata(STORE_ACCESS_KEY, defaultOptions, descriptor.value);
    return descriptor;
  };
};

/**
 * Guard that checks if user has any access to a store
 * This is a comprehensive access check that verifies:
 * 1. User authentication
 * 2. Tenant context
 * 3. Store access through roles and permissions
 * 4. Tenant super admin privileges (if enabled)
 */
@Injectable()
export class StoreAccessGuard implements CanActivate {
  private readonly logger = new Logger(StoreAccessGuard.name);

  constructor(
    private reflector: Reflector,
    private storeRolesService: StoreRolesService,
    private tenantContext: TenantContext,
    private storeContext: StoreContext
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get store access requirements from decorator metadata
    const requirement = this.reflector.get<StoreAccessRequirement>(
      STORE_ACCESS_KEY,
      context.getHandler()
    );

    // If no requirement is set, apply default behavior
    const options: StoreAccessRequirement = {
      storeIdParam: 'storeId',
      allowTenantSuperAdmin: true,
      requireActiveRole: true,
      fallbackToContext: true,
      ...requirement
    };

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check user authentication
    if (!user || !user.sub) {
      this.logger.warn('Store access denied: User not authenticated');
      throw new UnauthorizedException('User not authenticated');
    }

    // Check tenant context
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      this.logger.warn('Store access denied: Tenant context not found');
      throw new ForbiddenException('Tenant context not found');
    }

    // Extract store ID from request
    const storeId = await this.extractStoreId(request, options);
    if (!storeId) {
      this.logger.warn('Store access denied: Store ID not found');
      throw new ForbiddenException('Store context not found');
    }

    try {
      // Get user's store access information
      const userAccess = await this.storeRolesService.getUserStoreAccess(
        { userId: user.sub, storeId },
        { tenantId }
      );

      // Check tenant super admin access (if enabled)
      if (options.allowTenantSuperAdmin && userAccess.isTenantSuperAdmin) {
        this.logger.debug(`Store access granted: User ${user.sub} is tenant super admin for store ${storeId}`);
        return true;
      }

      // Check store-specific access
      const hasStoreAccess = this.checkStoreAccess(userAccess, storeId, options);

      if (!hasStoreAccess) {
        this.logger.warn(`Store access denied: User ${user.sub} has no access to store ${storeId}`);
        throw new ForbiddenException(`Access denied to store ${storeId}`);
      }

      this.logger.debug(`Store access granted: User ${user.sub} has access to store ${storeId}`);
      return true;

    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error(`Store access check failed: ${error.message}`, error.stack);
      throw new ForbiddenException('Store access verification failed');
    }
  }

  /**
   * Extract store ID from request parameters or context
   */
  private async extractStoreId(request: any, options: StoreAccessRequirement): Promise<string | null> {
    // Priority 1: Check specified parameter
    if (options.storeIdParam && request.params[options.storeIdParam]) {
      return request.params[options.storeIdParam];
    }

    // Priority 2: Check common parameter names
    if (request.params.storeId) {
      return request.params.storeId;
    }

    if (request.params.id) {
      // Sometimes store ID might be in 'id' parameter
      return request.params.id;
    }

    // Priority 3: Check query parameters
    if (request.query.storeId) {
      return request.query.storeId;
    }

    // Priority 4: Check request body
    if (request.body && request.body.storeId) {
      return request.body.storeId;
    }

    // Priority 5: Fallback to store context (if enabled)
    if (options.fallbackToContext) {
      try {
        return await this.storeContext.requireStoreId();
      } catch (error) {
        this.logger.debug('Could not get store ID from context:', error.message);
      }
    }

    return null;
  }

  /**
   * Check if user has store access based on their roles
   */
  private checkStoreAccess(userAccess: any, storeId: string, options: StoreAccessRequirement): boolean {
    if (!userAccess.userStoreRoles || userAccess.userStoreRoles.length === 0) {
      return false;
    }

    return userAccess.userStoreRoles.some((roleAssignment: any) => {
      // Check if the role assignment is for the correct store
      const isCorrectStore = roleAssignment.store.id === storeId;

      // Check if role is active (if required)
      const isActive = options.requireActiveRole ? roleAssignment.isActive : true;

      // Check if the role itself is active
      const isRoleActive = roleAssignment.storeRole?.active !== false;

      return isCorrectStore && isActive && isRoleActive;
    });
  }
}

// Convenience decorators for common store access patterns

/**
 * Require access to store specified in 'storeId' parameter
 */
export const RequireStoreAccessById = () => RequireStoreAccess({ storeIdParam: 'storeId' });

/**
 * Require access to store specified in 'id' parameter
 */
export const RequireStoreAccessByIdParam = () => RequireStoreAccess({ storeIdParam: 'id' });

/**
 * Require access to store from context only (no parameter extraction)
 */
export const RequireStoreAccessFromContext = () => RequireStoreAccess({
  fallbackToContext: true,
  storeIdParam: undefined
});

/**
 * Require store access but allow tenant super admin to bypass
 */
export const RequireStoreAccessWithSuperAdmin = () => RequireStoreAccess({
  allowTenantSuperAdmin: true
});

/**
 * Require strict store access (no tenant super admin bypass)
 */
export const RequireStrictStoreAccess = () => RequireStoreAccess({
  allowTenantSuperAdmin: false
});

/**
 * Require store access including inactive roles
 */
export const RequireStoreAccessIncludeInactive = () => RequireStoreAccess({
  requireActiveRole: false
});