import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

// Extend the Request interface to include tenantId
declare module 'express' {
  export interface Request {
    tenantId?: string;
  }
}


@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  // Existing method (returns string | null)
  getTenantId(): string | null {
    return this.request.tenantId || null;
  }

  // New method that throws if missing
  requireTenantId(): string {
    // const tenantId = this.request.tenantId;
    const tenantId = this.request.tenantId ?? this.request.headers['tenantid'] as string | undefined;
    // console.warn(this.request); // Debugging line
    if (!tenantId) {
      throw new Error('Tenant ID not found in request context');
    }
    return tenantId;
  }
}