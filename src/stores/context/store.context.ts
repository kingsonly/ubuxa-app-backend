import { Injectable, Scope, Inject, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreType } from '@prisma/client';

// Extend the Request interface to include storeId and user info
declare module 'express' {
  export interface Request {
    storeId?: string;
    user?: {
      sub: string;
      [key: string]: any;
    };
  }
}

export interface StoreContextOptions {
  allowSuperAdminAccess?: boolean; // Whether to check for super admin privileges
  storeIdParam?: string; // Optional store ID to use instead of context
  requireStoreScope?: boolean; // Whether store scoping is required (default: true)
}

@Injectable({ scope: Scope.REQUEST })
export class StoreContext {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    private readonly prisma: PrismaService
  ) { }

  // Get store ID (returns string | null)
  getStoreId(): string | null {
    return this.request.storeId || null;
  }

  // Get store ID with optional parameter override
  getStoreIdWithParam(storeIdParam?: string): string | null {
    if (storeIdParam) {
      return storeIdParam;
    }
    return this.getStoreId();
  }

  // Check if current user is tenant super admin
  async isTenantSuperAdmin(): Promise<boolean> {
    const user = this.request.user;
    const tenantId = this.request.tenantId;

    if (!user || !tenantId) {
      return false;
    }

    try {
      const superAdmin = await this.prisma.userStoreRole.findFirst({
        where: {
          userId: user.sub,
          tenantId,
          isActive: true,
          storeRole: {
            name: 'Tenant Super Admin',
            storeId: null // Tenant-wide role
          }
        }
      });

      return !!superAdmin;
    } catch (error) {
      console.error('Error checking super admin status:', error);
      return false;
    }
  }

  // Get store scope for database queries
  async getStoreScope(options: StoreContextOptions = {}): Promise<{
    storeId?: string;
    isSuperAdmin: boolean;
    shouldScope: boolean;
  }> {
    const {
      allowSuperAdminAccess = true,
      storeIdParam,
      requireStoreScope = true
    } = options;

    const isSuperAdmin = allowSuperAdminAccess ? await this.isTenantSuperAdmin() : false;
    
    // If user is super admin and no specific store is requested, don't scope
    if (isSuperAdmin && !storeIdParam && !this.getStoreId()) {
      return {
        isSuperAdmin: true,
        shouldScope: false
      };
    }

    // Get store ID (from param, context, or fallback)
    let storeId = this.getStoreIdWithParam(storeIdParam);
    
    if (!storeId && requireStoreScope) {
      storeId = await this.requireStoreId();
    }

    return {
      storeId: storeId || undefined,
      isSuperAdmin,
      shouldScope: !!storeId
    };
  }

  // Require store ID (throws if missing, tries to use main store as fallback)
  async requireStoreId(): Promise<string> {
    let storeId = this.request.storeId ?? this.request.headers['storeid'] as string | undefined;

    if (!storeId) {
      // Try to get the main store for the tenant as fallback
      const tenantId = this.request.tenantId;
      if (tenantId) {
        try {
          const mainStore = await this.prisma.store.findFirst({
            where: {
              tenantId,
              type: StoreType.MAIN,
              isActive: true
            },
            select: { id: true }
          });

          if (mainStore) {
            storeId = mainStore.id;
            // Set it in the request for future use
            this.request.storeId = storeId;
          }
        } catch (error) {
          console.error('Error fetching main store:', error);
          // Continue without setting storeId
        }
      }
    }

    if (!storeId) {
      throw new UnauthorizedException('Store ID not found in request context and no main store available');
    }

    return storeId;
  }

  // Synchronous version that doesn't try to fetch main store
  requireStoreIdSync(): string {
    const storeId = this.request.storeId ?? this.request.headers['storeid'] as string | undefined;

    if (!storeId) {
      throw new UnauthorizedException('Store ID not found in request context');
    }
    return storeId;
  }

  // Build where clause for Prisma queries with store scoping
  async buildStoreWhereClause(
    baseWhere: any = {},
    options: StoreContextOptions = {}
  ): Promise<any> {
    const scope = await this.getStoreScope(options);
    
    if (!scope.shouldScope) {
      // Super admin without specific store - return base where clause
      return baseWhere;
    }

    // Add store scoping to where clause
    return {
      ...baseWhere,
      storeId: scope.storeId
    };
  }
}