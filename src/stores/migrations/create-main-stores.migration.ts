import { PrismaService } from '../../prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CreateMainStoresMigration {
  private readonly logger = new Logger(CreateMainStoresMigration.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create main stores for existing tenants that don't have one
   */
  async migrateExistingTenants(): Promise<void> {
    this.logger.log('Starting main store migration for existing tenants...');

    try {
      // Find all tenants that don't have a main store
      const tenantsWithoutMainStore = await this.prisma.tenant.findMany({
        where: {
          stores: {
            none: {
              type: 'MAIN',
              deletedAt: null
            }
          }
        },
        select: {
          id: true,
          companyName: true,
          phone: true,
          email: true,
          stores: {
            where: { isMain: true }
          }
        }
      });

      this.logger.log(`Found ${tenantsWithoutMainStore.length} tenants without main stores`);

      if (tenantsWithoutMainStore.length === 0) {
        this.logger.log('No tenants need main store creation');
        return;
      }

      // Create main stores for each tenant
      const results = await Promise.allSettled(
        tenantsWithoutMainStore.map(async (tenant) => {
          return this.prisma.store.create({
            data: {
              name: `${tenant.companyName} Main Store`,
              tenantId: tenant.id,
              type: 'MAIN',
              phone: tenant.phone,
              email: tenant.email,
              isActive: true,
            }
          });
        })
      );

      // Count successful and failed creations
      const successful = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.filter(result => result.status === 'rejected').length;

      this.logger.log(`Migration completed: ${successful} main stores created, ${failed} failed`);

      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const tenant = tenantsWithoutMainStore[index];
          this.logger.error(
            `Failed to create main store for tenant ${tenant.id} (${tenant.companyName}): ${result.reason}`
          );
        }
      });

    } catch (error) {
      this.logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Assign users to main stores for their tenants
   */
  async assignUsersToMainStores(): Promise<void> {
    this.logger.log('Starting user assignment to main stores...');

    try {
      // Find users without store assignments who have single tenant
      const usersToAssign = await this.prisma.user.findMany({
        where: {
          assignedStoreId: null,
          deletedAt: null,
          tenants: {
            some: {}
          }
        },
        include: {
          tenants: {
            include: {
              tenant: {
                include: {
                  stores: {
                    where: { 
                      type: 'MAIN', 
                      deletedAt: null 
                    }
                  }
                }
              }
            }
          }
        }
      });

      this.logger.log(`Found ${usersToAssign.length} users to assign to main stores`);

      const assignments = [];

      // Process users with single tenant
      for (const user of usersToAssign) {
        if (user.tenants.length === 1) {
          const mainStore = user.tenants[0].tenant.stores[0];
          if (mainStore) {
            assignments.push({
              userId: user.id,
              storeId: mainStore.id
            });
          }
        }
      }

      this.logger.log(`Assigning ${assignments.length} users to main stores`);

      // Batch update users
      const results = await Promise.allSettled(
        assignments.map(async (assignment) => {
          return this.prisma.user.update({
            where: { id: assignment.userId },
            data: { assignedStoreId: assignment.storeId }
          });
        })
      );

      const successful = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.filter(result => result.status === 'rejected').length;

      this.logger.log(`User assignment completed: ${successful} users assigned, ${failed} failed`);

      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const assignment = assignments[index];
          this.logger.error(
            `Failed to assign user ${assignment.userId} to store ${assignment.storeId}: ${result.reason}`
          );
        }
      });

    } catch (error) {
      this.logger.error('User assignment migration failed:', error);
      throw error;
    }
  }

  /**
   * Validate that all tenants have main stores after migration
   */
  async validateMigration(): Promise<boolean> {
    this.logger.log('Validating migration results...');

    try {
      // Check for tenants without main stores
      const tenantsWithoutMainStore = await this.prisma.tenant.count({
        where: {
          stores: {
            none: {
              type: 'MAIN',
              deletedAt: null
            }
          }
        }
      });

      if (tenantsWithoutMainStore > 0) {
        this.logger.error(`Validation failed: ${tenantsWithoutMainStore} tenants still don't have main stores`);
        return false;
      }

      // Check for duplicate main stores per tenant
      const duplicateMainStores = await this.prisma.tenant.findMany({
        where: {
          stores: {
            some: {
              type: 'MAIN',
              deletedAt: null
            }
          }
        },
        include: {
          stores: {
            where: {
              type: 'MAIN',
              deletedAt: null
            }
          }
        }
      });

      const tenantsWithMultipleMainStores = duplicateMainStores.filter(
        tenant => tenant.stores.length > 1
      );

      if (tenantsWithMultipleMainStores.length > 0) {
        this.logger.error(
          `Validation warning: ${tenantsWithMultipleMainStores.length} tenants have multiple main stores`
        );
        tenantsWithMultipleMainStores.forEach(tenant => {
          this.logger.error(`Tenant ${tenant.id} has ${tenant.stores.length} main stores`);
        });
      }

      this.logger.log('Migration validation completed successfully');
      return true;

    } catch (error) {
      this.logger.error('Migration validation failed:', error);
      return false;
    }
  }

  /**
   * Run complete migration process
   */
  async runMigration(): Promise<void> {
    this.logger.log('Starting complete store migration process...');

    try {
      // Step 1: Create main stores for tenants
      await this.migrateExistingTenants();

      // Step 2: Assign users to main stores
      await this.assignUsersToMainStores();

      // Step 3: Validate migration
      const isValid = await this.validateMigration();

      if (isValid) {
        this.logger.log('Store migration completed successfully');
      } else {
        throw new Error('Migration validation failed');
      }

    } catch (error) {
      this.logger.error('Store migration failed:', error);
      throw error;
    }
  }
}