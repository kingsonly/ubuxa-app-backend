import { Injectable, Scope, Inject, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreType } from '@prisma/client';

// Extend the Request interface to include storeId
declare module 'express' {
  export interface Request {
    storeId?: string;
  }
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
}