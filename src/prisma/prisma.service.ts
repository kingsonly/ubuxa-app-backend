import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private readonly tenantStorage = new AsyncLocalStorage<{tenantId: string}>();

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Successfully connected to MongoDB via Prisma');

      this.$use(async (params, next) => {
        // Skip tenant filtering for certain models
        const excludedModels = ['Tenant', 'Role', 'Permission'];

        // Get tenant context from AsyncLocalStorage
        const tenantContext = this.tenantStorage.getStore();
        const tenantId = tenantContext?.tenantId;

        if (
          !excludedModels.includes(params.model) &&
          tenantId &&
          ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'delete', 'update'].includes(params.action)
        ) {
          this.logger.debug(`Applying tenant filter (${tenantId}) for ${params.model}.${params.action}`);
          const newParams = { ...params };

          if (!newParams.args) {
            newParams.args = {};
          }

          if (!newParams.args.where) {
            newParams.args.where = {};
          }

          newParams.args.where = {
            ...newParams.args.where,
            tenantId,
          };

          return next(newParams);
        }

        return next(params);
      });
    } catch (error) {
      this.logger.error('❌ Failed to connect to MongoDB:', error.message);
      throw error;
    }
  }

  // Method to run operations within a tenant context
  runWithTenant<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
    return this.tenantStorage.run({tenantId}, operation);
  }

  // Get current tenant ID
  getCurrentTenantId(): string | undefined {
    return this.tenantStorage.getStore()?.tenantId;
  }

  // Helper method to create data with tenant ID
  withTenantId<T extends Record<string, any>>(data: T): T & { tenantId: string } {
    const tenantId = this.getCurrentTenantId();
    if (!tenantId) {
      this.logger.warn('No tenant context found when creating data');
      return data as T & { tenantId: string };
    }
    return { ...data, tenantId };
  }
}

// import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
// import { PrismaClient } from '@prisma/client';

// @Injectable()
// export class PrismaService extends PrismaClient implements OnModuleInit {
//   private readonly logger = new Logger(PrismaService.name);

//   async onModuleInit() {
//     try {
//       await this.$connect();
//       // this.$extends
//       this.logger.log('✅ Successfully connected to MongoDB via Prisma');
//     } catch (error) {
//       this.logger.error('❌ Failed to connect to MongoDB:', error.message);
//       throw error;
//     }

//   }
// }