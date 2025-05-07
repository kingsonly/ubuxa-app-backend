import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
 private readonly logger = new Logger(PrismaService.name);
 private readonly tenantStorage = new AsyncLocalStorage<{tenantId: string}>();
 private bypassTenantFilter = false;

 async onModuleInit() {
   try {
     await this.$connect();
     this.logger.log('✅ Successfully connected to MongoDB via Prisma');

     // Add middleware to automatically filter by tenant
     this.$use(async (params, next) => {
       // Skip tenant filtering for certain models
       const excludedModels = ['Tenant', 'Role', 'Permission'];

       // Skip if bypass is enabled
       if (this.bypassTenantFilter) {
         return next(params);
       }

       // Skip for excluded models
       if (excludedModels.includes(params.model)) {
         return next(params);
       }

       // Get tenant context from AsyncLocalStorage
       const tenantContext = this.tenantStorage.getStore();
       const tenantId = tenantContext?.tenantId;

       if (
         tenantId &&
         ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'delete', 'update', 'create'].includes(params.action)
       ) {
         this.logger.debug(`Applying tenant filter (${tenantId}) for ${params.model}.${params.action}`);

         // Clone the params to avoid modifying the original
         const newParams = { ...params };

         if (!newParams.args) {
           newParams.args = {};
         }

         // For create operations, add tenantId to the data
         if (params.action === 'create') {
           if (!newParams.args.data) {
             newParams.args.data = {};
           }

           newParams.args.data = {
             ...newParams.args.data,
             tenantId,
           };
         }
         // For other operations, add tenantId to the where clause
         else {
           if (!newParams.args.where) {
             newParams.args.where = {};
           }

           newParams.args.where = {
             ...newParams.args.where,
             tenantId,
           };
         }

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

 // Method to temporarily bypass tenant filtering (for admin operations)
 bypassTenant<T>(operation: () => Promise<T>): Promise<T> {
   const previousState = this.bypassTenantFilter;
   this.bypassTenantFilter = true;

   return operation().finally(() => {
     this.bypassTenantFilter = previousState;
   });
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

 // Set current tenant ID (useful in middleware)
 setCurrentTenant(tenantId: string) {
   // This will create a new context if none exists
   if (!this.tenantStorage.getStore()) {
     return this.tenantStorage.run({tenantId}, () => {});
   }

   // Otherwise modify the existing context (not generally recommended with AsyncLocalStorage
   // but can be useful in middleware scenarios)
   const store = this.tenantStorage.getStore();
   if (store) {
     store.tenantId = tenantId;
   }
 }

 // Check if tenant exists
 async tenantExists(tenantId: string): Promise<boolean> {
   const tenant = await this.bypassTenant(() =>
     this.tenant.findUnique({
       where: { id: tenantId, isActive: true }
     })
   );
   return !!tenant;
 }

 // Create a tenant
//  async createTenant(data: { name: string; description?: string; domain?: string }): Promise<any> {
//    return this.bypassTenant(() =>
//      this.tenant.create({ data: { ...data, isActive: true } })
//    );
//  }

 // Get all tenants (admin function)
 async getAllTenants(): Promise<any[]> {
   return this.bypassTenant(() =>
     this.tenant.findMany({
       where: { isActive: true },
       orderBy: { name: 'asc' }
     })
   );
 }
}

// import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
// import { PrismaClient } from '@prisma/client';
// import { AsyncLocalStorage } from 'async_hooks';

// @Injectable()
// export class PrismaService extends PrismaClient implements OnModuleInit {
//   private readonly logger = new Logger(PrismaService.name);
//   private readonly tenantStorage = new AsyncLocalStorage<{ tenantId: string }>();
//   private bypassTenantFilter = false;


//   async onModuleInit() {
//     try {
//       await this.$connect();
//       this.logger.log('✅ Successfully connected to MongoDB via Prisma');

//       this.$use(async (params, next) => {
//         // Skip tenant filtering for certain models
//         const excludedModels = ['Tenant', 'Role', 'Permission'];

//         // Get tenant context from AsyncLocalStorage
//         const tenantContext = this.tenantStorage.getStore();
//         const tenantId = tenantContext?.tenantId;

//         if (this.bypassTenantFilter || excludedModels.includes(params.model)) {
//     return next(params);
//   }

//         if (
//           !excludedModels.includes(params.model) &&
//           tenantId &&
//           ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'delete', 'update'].includes(params.action)
//         ) {
//           this.logger.debug(`Applying tenant filter (${tenantId}) for ${params.model}.${params.action}`);
//           const newParams = { ...params };

//           if (!newParams.args) {
//             newParams.args = {};
//           }

//           if (!newParams.args.where) {
//             newParams.args.where = {};
//           }

//           newParams.args.where = {
//             ...newParams.args.where,
//             tenantId,
//           };

//           return next(newParams);
//         }

//         return next(params);
//       });
//     } catch (error) {
//       this.logger.error('❌ Failed to connect to MongoDB:', error.message);
//       throw error;
//     }
//   }

//   // Method to run operations within a tenant context
//   runWithTenant<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
//     return this.tenantStorage.run({tenantId}, operation);
//   }

//   // Get current tenant ID
//   getCurrentTenantId(): string | undefined {
//     return this.tenantStorage.getStore()?.tenantId;
//   }

//   // Helper method to create data with tenant ID
//   withTenantId<T extends Record<string, any>>(data: T): T & { tenantId: string } {
//     const tenantId = this.getCurrentTenantId();
//     if (!tenantId) {
//       this.logger.warn('No tenant context found when creating data');
//       return data as T & { tenantId: string };
//     }
//     return { ...data, tenantId };
//   }

//   bypassTenant<T>(operation: () => Promise<T>): Promise<T> {
//   const previousState = this.bypassTenantFilter;
//   this.bypassTenantFilter = true;

//   return operation().finally(() => {
//     this.bypassTenantFilter = previousState;
//   });
// }
// }

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