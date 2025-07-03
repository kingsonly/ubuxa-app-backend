import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreType } from '@prisma/client';

export const STORE_ACCESS_KEY = 'store_access';

export interface StoreAccessOptions {
  requireStoreAccess?: boolean;
  allowedStoreTypes?: StoreType[];
  requireParentAccess?: boolean;
  requireChildAccess?: boolean;
}

export const RequireStoreAccess = (options: StoreAccessOptions = {}) =>
  Reflector.createDecorator<StoreAccessOptions>({
    key: STORE_ACCESS_KEY,
    transform: () => ({ requireStoreAccess: true, ...options })
  });

@Injectable()
export class StoreAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const storeAccessOptions = this.reflector.get<StoreAccessOptions>(
      STORE_ACCESS_KEY,
      context.getHandler()
    );

    if (!storeAccessOptions?.requireStoreAccess) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId;
    const storeId = request.params.id || request.params.storeId;

    if (!user || !tenantId || !storeId) {
      throw new ForbiddenException('Missing required context');
    }

    // Check if user has access to the store
    const userStoreAccess = await this.checkUserStoreAccess(
      user.sub,
      storeId,
      tenantId,
      storeAccessOptions
    );

    if (!userStoreAccess) {
      throw new ForbiddenException('Access denied to this store');
    }

    // Attach store context to request for use in services
    request.storeContext = userStoreAccess;

    return true;
  }

  private async checkUserStoreAccess(
    userId: string,
    storeId: string,
    tenantId: string,
    options: StoreAccessOptions
  ) {
    // Get user's store assignments
    const userStores = await this.prisma.storeUser.findMany({
      where: { userId },
      include: {
        store: {
          include: {
            parent: true,
            children: true
          }
        },
        role: true
      }
    });

    const targetStore = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      include: {
        parent: true,
        children: true
      }
    });

    if (!targetStore) {
      return null;
    }

    // Check direct store access
    const directAccess = userStores.find(us => us.storeId === storeId);
    if (directAccess) {
      return {
        store: targetStore,
        userStore: directAccess,
        accessType: 'direct' as const
      };
    }

    // Check if user has access to parent store (and options allow parent access)
    if (options.requireParentAccess && targetStore.parentId) {
      const parentAccess = userStores.find(us => us.storeId === targetStore.parentId);
      if (parentAccess) {
        return {
          store: targetStore,
          userStore: parentAccess,
          accessType: 'parent' as const
        };
      }
    }

    // Check if user has access to child stores (and options allow child access)
    if (options.requireChildAccess) {
      const childAccess = userStores.find(us => 
        targetStore.children.some(child => child.id === us.storeId)
      );
      if (childAccess) {
        return {
          store: targetStore,
          userStore: childAccess,
          accessType: 'child' as const
        };
      }
    }

    // Check if user has access to main store (main store users can access all stores)
    const mainStoreAccess = userStores.find(us => us.store.type === StoreType.MAIN);
    if (mainStoreAccess) {
      return {
        store: targetStore,
        userStore: mainStoreAccess,
        accessType: 'main_store_admin' as const
      };
    }

    // Check allowed store types
    if (options.allowedStoreTypes) {
      const typeBasedAccess = userStores.find(us => 
        options.allowedStoreTypes!.includes(us.store.type)
      );
      if (typeBasedAccess) {
        return {
          store: targetStore,
          userStore: typeBasedAccess,
          accessType: 'type_based' as const
        };
      }
    }

    return null;
  }
}