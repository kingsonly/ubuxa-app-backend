import { Injectable, Scope, Inject, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

// Extend the Request interface to include storeId
declare module 'express' {
  export interface Request {
    storeId?: string;
  }
}

@Injectable({ scope: Scope.REQUEST })
export class StoreContext {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  // Existing method (returns string | null)
  getStoreId(): string | null {
    return this.request.storeId || null;
  }

  // New method that throws if missing
  requireStoreId(): string {
    const storeId = this.request.storeId ?? this.request.headers['storeid'] as string | undefined;
    
    if (!storeId) {
      throw new UnauthorizedException('Store ID not found in request context');
    }
    return storeId;
  }
}