import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private readonly tenantStorage = new AsyncLocalStorage<{ tenantId: string }>();
  private bypassTenantFilter = false;

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Successfully connected to database');

      this.$use(async (params, next) => {
        if (this.bypassTenantFilter) return next(params);

        const tenantId = this.tenantStorage.getStore()?.tenantId;
        const excludedModels = ['Tenant', 'Permission', 'User'];

        if (!tenantId || excludedModels.includes(params.model)) {
          return next(params);
        }

        const newParams = { ...params };
        this.applyTenantFilters(newParams, tenantId);
        return next(newParams);
      });
    } catch (error) {
      this.logger.error('❌ Database connection error:', error);
      throw error;
    }
  }

  private applyTenantFilters(params: any, tenantId: string) {
    this.logger.debug(`Applying tenant (${tenantId}) to ${params.model}.${params.action}`);

    switch (params.model) {
      case 'User':
        this.handleUserModel(params, tenantId);
        break;

      case 'Role':
      case 'UserTenant':
        this.handleStandardModel(params, tenantId);
        break;

      default:
        this.handleDefaultModel(params, tenantId);
    }
  }

  private handleUserModel(params: any, tenantId: string) {
    if (['findMany', 'count', 'aggregate'].includes(params.action)) {
      params.args.where = {
        ...params.args.where,
        memberships: { some: { tenantId } }
      };
    }
  }

  private handleStandardModel(params: any, tenantId: string) {
    if (params.action === 'create') {
      params.args.data = { ...params.args.data, tenantId };
    } else {
      params.args.where = { ...params.args.where, tenantId };
    }
  }

  private handleDefaultModel(params: any, tenantId: string) {
    if (params.action === 'create') {
      params.args.data = { ...params.data, tenantId };
    } else {
      params.args.where = { ...params.where, tenantId };
    }
  }

  // Tenant Context Management
  setCurrentTenant(tenantId: string) {
    this.tenantStorage.enterWith({ tenantId });
  }

  get currentTenantId(): string | undefined {
    return this.tenantStorage.getStore()?.tenantId;
  }

  async withTenant<T>(tenantId: string, callback: () => Promise<T>): Promise<T> {
    return this.tenantStorage.run({ tenantId }, callback);
  }

  async bypassTenant<T>(callback: () => Promise<T>): Promise<T> {
    const prev = this.bypassTenantFilter;
    this.bypassTenantFilter = true;
    try {
      return await callback();
    } finally {
      this.bypassTenantFilter = prev;
    }
  }

  // Tenant Validation
  async validateTenant(tenantId: string): Promise<boolean> {
    return this.bypassTenant(() =>
      this.tenant.count({ where: { id: tenantId } }).then(count => count > 0)
    );
  }

  // User-Tenant Management
  async getUserTenants(userId: string): Promise<any[]> {
    return this.bypassTenant(() =>
      this.userTenant.findMany({
        where: { userId },
        include: { tenant: true, role: true }
      })
    );
  }
}