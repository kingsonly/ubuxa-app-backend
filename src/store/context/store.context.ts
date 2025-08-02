import {
  Injectable,
  Scope,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

// Extend the Request interface to include storeId
declare module 'express' {
  export interface Request {
    tenantId?: string;
    storeId?: string;
  }
}

@Injectable({ scope: Scope.REQUEST })
export class StoreContext {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  // Get store ID (returns string | null)
  getStoreId(): string | null {
    return this.request.storeId || null;
  }

  // Require store ID (throws if missing)
  requireStoreId(): string {
    const storeId =
      this.request.storeId ??
      (this.request.headers['storeid'] as string | undefined);

    if (!storeId) {
      throw new UnauthorizedException('Store ID not found in request context');
    }

    return storeId;
  }

  // Optional: Get both tenant and store IDs together
  getStoreContext(): { tenantId: string | null; storeId: string | null } {
    const tenantId =
      this.request.tenantId ??
      (this.request.headers['tenantid'] as string | undefined);
    const storeId =
      this.request.storeId ??
      (this.request.headers['storeid'] as string | undefined);

    return {
      tenantId: tenantId || null,
      storeId: storeId || null,
    };
  }

  // Optional: Require both tenant and store IDs
  requireStoreContext(): { tenantId: string; storeId: string } {
    const tenantId =
      this.request.tenantId ??
      (this.request.headers['tenantid'] as string | undefined);
    const storeId =
      this.request.storeId ??
      (this.request.headers['storeid'] as string | undefined);

    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID not found in request context');
    }

    if (!storeId) {
      throw new UnauthorizedException('Store ID not found in request context');
    }

    return { tenantId, storeId };
  }
}
