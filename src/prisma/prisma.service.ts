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
      // this.logger.log('✅ Successfully connected to database');

      this.$use(async (params, next) => {
        if (this.bypassTenantFilter) return next(params);

        const tenantId = this.tenantStorage.getStore()?.tenantId;
        const excludedModels = ['Tenant'];

        // Don't apply tenant filtering for excluded models or when no tenant is set
        if (!tenantId || excludedModels.includes(params.model)) {
          return next(params);
        }

        // Clone params to avoid modifying the original
        const newParams = { ...params };

        try {
          this.applyTenantFilters(newParams, tenantId);
          return next(newParams);
        } catch (error) {
          this.logger.error(`Error applying tenant filters: ${error.message}`);
          throw new Error('Error applying tenant filters');
        }
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
    if (['findMany', 'findFirst', 'count', 'aggregate'].includes(params.action)) {
      params.args.where = {
        ...params.args.where,
        memberships: { some: { tenantId } }
      };
    } else if (params.action === 'findUnique' || params.action === 'findFirst') {
      // Convert findUnique to findFirst to apply tenant filter
      params.action = 'findFirst';
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
    if (!tenantId) {
      throw new Error('Invalid tenant ID');
    }
    this.tenantStorage.enterWith({ tenantId });
    this.logger.debug(`Set current tenant to: ${tenantId}`);
  }

  clearTenantContext() {
    this.tenantStorage.enterWith(null);
    this.logger.debug('Cleared tenant context');
  }

  get currentTenantId(): string | undefined {
    return this.tenantStorage.getStore()?.tenantId;
  }


  async withTenant<T>(tenantId: string, callback: () => Promise<T>): Promise<T> {
    if (!tenantId) {
      throw new Error('Tenant ID is required for withTenant operation');
    }
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
    if (!tenantId) return false;

    return this.bypassTenant(async () => {
      try {
        const count = await this.tenant.count({
          where: {
            id: tenantId,
            status: 'ACTIVE'
          }
        });
        return count > 0;
      } catch (error) {
        this.logger.error(`Error validating tenant: ${error.message}`);
        return false;
      }
    });
  }

  // User-Tenant Management
  async getUserTenants(userId: string): Promise<any[]> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    return this.bypassTenant(async () => {
      try {
        return await this.userTenant.findMany({
          where: { userId },
          include: {
            tenant: true,
            role: {
              include: {
                permissions: true
              }
            }
          }
        });
      } catch (error) {
        this.logger.error(`Error fetching user tenants: ${error.message}`);
        throw new Error('Failed to fetch user tenants');
      }
    });
  }

 /**
   * Creates a new record with the current tenantId automatically added
   * @param model The Prisma model name (e.g., 'User', 'Product')
   * @param data The data to create
   * @returns The created record
   */
 async createWithTenant<T>(model: string, data: Omit<T, 'tenantId'>): Promise<T> {
  const tenantId = this.currentTenantId;
  if (!tenantId) {
    throw new Error('No tenant context set for createWithTenant operation');
  }

  // Validate the tenant exists
  const tenantExists = await this.validateTenant(tenantId);
  if (!tenantExists) {
    throw new Error(`Tenant ${tenantId} not found or inactive`);
  }

  return this[model].create({
    data: {
      ...data,
      tenantId, // Automatically add tenantId
    },
  });
}

/**
 * Updates a record with tenant context validation
 * @param model The Prisma model name
 * @param params Update parameters
 * @returns The updated record
 */
async updateWithTenant<T>(
  model: string,
  params: {
    where: { id: string } & Record<string, any>;
    data: Partial<T>;
  }
): Promise<T> {
  const tenantId = this.currentTenantId;
  if (!tenantId) {
    throw new Error('No tenant context set for updateWithTenant operation');
  }

  // First verify the record belongs to the tenant
  const existing = await this[model].findFirst({
    where: {
      ...params.where,
      tenantId,
    },
  });

  if (!existing) {
    throw new Error(`Record not found or doesn't belong to tenant ${tenantId}`);
  }

  return this[model].update({
    where: params.where,
    data: params.data,
  });
}

/**
 * Finds records with automatic tenant filtering
 * @param model The Prisma model name
 * @param args Optional query arguments
 * @returns Array of records
 */
async findManyWithTenant<T>(
  model: string,
  args?: {
    where?: Record<string, any>;
    include?: Record<string, any>;
    select?: Record<string, any>;
  }
): Promise<T[]> {
  const tenantId = this.currentTenantId;
  if (!tenantId) {
    throw new Error('No tenant context set for findManyWithTenant operation');
  }

  return this[model].findMany({
    ...args,
    where: {
      ...args?.where,
      tenantId, // Automatically filter by tenant
    },
  });
}

/**
 * Deletes a record with tenant context validation
 * @param model The Prisma model name
 * @param where Delete conditions
 */
async deleteWithTenant(
  model: string,
  where: { id: string } & Record<string, any>
): Promise<void> {
  const tenantId = this.currentTenantId;
  if (!tenantId) {
    throw new Error('No tenant context set for deleteWithTenant operation');
  }

  // First verify the record belongs to the tenant
  const existing = await this[model].findFirst({
    where: {
      ...where,
      tenantId,
    },
  });

  if (!existing) {
    throw new Error(`Record not found or doesn't belong to tenant ${tenantId}`);
  }

  await this[model].delete({
    where,
  });
}

  //FIXME: fix transactions
async transactionWithTenant<T>(
  callback: (prisma: PrismaService) => Promise<T>
): Promise<T> {
  return this.$transaction(async () => {
    const transactionalPrisma = new PrismaService();
    // Copy tenant context to transactional instance
    if (this.currentTenantId) {
      transactionalPrisma.setCurrentTenant(this.currentTenantId);
    }
    return callback(transactionalPrisma);
  });
}
}