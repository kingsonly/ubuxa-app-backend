import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreClass } from '@prisma/client';
import {
  StoreAllocationHelper,
  StoreAllocations,
} from '../store/store-allocation.helper';

@Injectable()
export class AllocateInventoryBatchesMigration {
  private readonly logger = new Logger(AllocateInventoryBatchesMigration.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocate all existing inventory batches to their tenant's main store
   */
  async migrateExistingBatches(): Promise<void> {
    this.logger.log('Starting inventory batch allocation migration...');

    try {
      // First, ensure all tenants have main stores
      await this.validateMainStores();

      // Get all inventory batches that don't have store allocations
      const batchesToMigrate = await this.prisma.inventoryBatch.findMany({
        where: {
          OR: [{ storeAllocations: null }, { storeAllocations: {} }],
        },
        include: {
          inventory: {
            include: {
              tenant: {
                include: {
                  stores: {
                    where: {
                      classification: StoreClass.MAIN,
                      deletedAt: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      this.logger.log(
        `Found ${batchesToMigrate.length} inventory batches to migrate`,
      );

      if (batchesToMigrate.length === 0) {
        this.logger.log('No inventory batches need allocation migration');
        return;
      }

      // Process batches in chunks to avoid memory issues
      const chunkSize = 100;
      const chunks = this.chunkArray(batchesToMigrate, chunkSize);
      let totalProcessed = 0;
      let totalSuccessful = 0;
      let totalFailed = 0;

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (batch) => {
            const mainStore = batch.inventory.tenant.stores[0];

            if (!mainStore) {
              throw new Error(
                `No main store found for tenant ${batch.inventory.tenant.id}`,
              );
            }

            // Create store allocation for the main store
            const storeAllocations: StoreAllocations =
              StoreAllocationHelper.updateStoreAllocation(
                {},
                mainStore.id,
                batch.remainingQuantity,
                batch.reservedQuantity,
                'SYSTEM_MIGRATION',
              );

            // Update the batch with store allocations
            return this.prisma.inventoryBatch.update({
              where: { id: batch.id },
              data: {
                storeAllocations: storeAllocations as any,
              },
            });
          }),
        );

        // Count results for this chunk
        const chunkSuccessful = results.filter(
          (result) => result.status === 'fulfilled',
        ).length;
        const chunkFailed = results.filter(
          (result) => result.status === 'rejected',
        ).length;

        totalProcessed += chunk.length;
        totalSuccessful += chunkSuccessful;
        totalFailed += chunkFailed;

        this.logger.log(
          `Processed chunk: ${chunkSuccessful} successful, ${chunkFailed} failed. ` +
            `Total progress: ${totalProcessed}/${batchesToMigrate.length}`,
        );

        // Log any failures in this chunk
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const batch = chunk[index];
            this.logger.error(
              `Failed to allocate batch ${batch.id} (${batch.batchNumber}) ` +
                `for inventory ${batch.inventory.name}: ${result.reason}`,
            );
          }
        });
      }

      this.logger.log(
        `Migration completed: ${totalSuccessful} batches allocated, ${totalFailed} failed`,
      );

      if (totalFailed > 0) {
        throw new Error(`Migration completed with ${totalFailed} failures`);
      }
    } catch (error) {
      this.logger.error('Inventory batch allocation migration failed:', error);
      throw error;
    }
  }

  /**
   * Validate that all tenants have main stores before migration
   */
  private async validateMainStores(): Promise<void> {
    this.logger.log('Validating that all tenants have main stores...');

    const tenantsWithoutMainStore = await this.prisma.tenant.findMany({
      where: {
        stores: {
          none: {
            classification: StoreClass.MAIN,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        companyName: true,
      },
    });

    if (tenantsWithoutMainStore.length > 0) {
      this.logger.error(
        `Found ${tenantsWithoutMainStore.length} tenants without main stores:`,
      );
      tenantsWithoutMainStore.forEach((tenant) => {
        this.logger.error(`- Tenant ${tenant.id} (${tenant.companyName})`);
      });

      throw new Error(
        'Cannot proceed with inventory batch migration: some tenants do not have main stores. ' +
          'Please run the store migration first.',
      );
    }

    this.logger.log('All tenants have main stores - validation passed');
  }

  /**
   * Validate migration results
   */
  async validateMigration(): Promise<boolean> {
    this.logger.log(
      'Validating inventory batch allocation migration results...',
    );

    try {
      // Check for batches without store allocations
      const batchesWithoutAllocations = await this.prisma.inventoryBatch.count({
        where: {
          OR: [{ storeAllocations: null }, { storeAllocations: {} }],
        },
      });

      if (batchesWithoutAllocations > 0) {
        this.logger.error(
          `Validation failed: ${batchesWithoutAllocations} batches still don't have store allocations`,
        );
        return false;
      }

      // Validate allocation quantities match batch quantities
      const batchesWithAllocations = await this.prisma.inventoryBatch.findMany({
        where: {
          storeAllocations: {
            not: null,
          },
        },
        select: {
          id: true,
          batchNumber: true,
          remainingQuantity: true,
          reservedQuantity: true,
          storeAllocations: true,
          inventory: {
            select: {
              name: true,
            },
          },
        },
      });

      let validationErrors = 0;

      for (const batch of batchesWithAllocations) {
        const allocations = batch.storeAllocations as StoreAllocations;
        const totalAllocated =
          StoreAllocationHelper.getTotalAllocated(allocations);
        const totalReserved =
          StoreAllocationHelper.getTotalReserved(allocations);

        if (totalAllocated !== batch.remainingQuantity) {
          this.logger.error(
            `Allocation mismatch for batch ${batch.id} (${batch.inventory.name} #${batch.batchNumber}): ` +
              `allocated ${totalAllocated} != remaining ${batch.remainingQuantity}`,
          );
          validationErrors++;
        }

        if (totalReserved !== batch.reservedQuantity) {
          this.logger.error(
            `Reservation mismatch for batch ${batch.id} (${batch.inventory.name} #${batch.batchNumber}): ` +
              `reserved ${totalReserved} != batch reserved ${batch.reservedQuantity}`,
          );
          validationErrors++;
        }
      }

      if (validationErrors > 0) {
        this.logger.error(
          `Validation failed: ${validationErrors} allocation mismatches found`,
        );
        return false;
      }

      this.logger.log('Migration validation completed successfully');
      return true;
    } catch (error) {
      this.logger.error('Migration validation failed:', error);
      return false;
    }
  }

  /**
   * Rollback migration by removing store allocations
   */
  async rollbackMigration(): Promise<void> {
    this.logger.log('Starting inventory batch allocation rollback...');

    try {
      // Find all batches with store allocations that were created by migration
      const batchesToRollback = await this.prisma.inventoryBatch.findMany({
        where: {
          storeAllocations: {
            not: null,
          },
        },
        select: {
          id: true,
          batchNumber: true,
          storeAllocations: true,
          inventory: {
            select: {
              name: true,
            },
          },
        },
      });

      this.logger.log(`Found ${batchesToRollback.length} batches to rollback`);

      // Filter batches that were created by system migration
      const migrationBatches = batchesToRollback.filter((batch) => {
        const allocations = batch.storeAllocations as StoreAllocations;
        return Object.values(allocations).some(
          (allocation) => allocation.updatedBy === 'SYSTEM_MIGRATION',
        );
      });

      this.logger.log(
        `Rolling back ${migrationBatches.length} migration-created allocations`,
      );

      if (migrationBatches.length === 0) {
        this.logger.log('No migration allocations found to rollback');
        return;
      }

      // Process rollback in chunks
      const chunkSize = 100;
      const chunks = this.chunkArray(migrationBatches, chunkSize);
      let totalProcessed = 0;
      let totalSuccessful = 0;
      let totalFailed = 0;

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (batch) => {
            return this.prisma.inventoryBatch.update({
              where: { id: batch.id },
              data: {
                storeAllocations: null,
                transferRequests: null,
              },
            });
          }),
        );

        const chunkSuccessful = results.filter(
          (result) => result.status === 'fulfilled',
        ).length;
        const chunkFailed = results.filter(
          (result) => result.status === 'rejected',
        ).length;

        totalProcessed += chunk.length;
        totalSuccessful += chunkSuccessful;
        totalFailed += chunkFailed;

        this.logger.log(
          `Rollback chunk: ${chunkSuccessful} successful, ${chunkFailed} failed. ` +
            `Total progress: ${totalProcessed}/${migrationBatches.length}`,
        );

        // Log any failures
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const batch = chunk[index];
            this.logger.error(
              `Failed to rollback batch ${batch.id} (${batch.inventory.name} #${batch.batchNumber}): ${result.reason}`,
            );
          }
        });
      }

      this.logger.log(
        `Rollback completed: ${totalSuccessful} batches rolled back, ${totalFailed} failed`,
      );

      if (totalFailed > 0) {
        throw new Error(`Rollback completed with ${totalFailed} failures`);
      }
    } catch (error) {
      this.logger.error('Inventory batch allocation rollback failed:', error);
      throw error;
    }
  }

  /**
   * Run complete migration process
   */
  async runMigration(): Promise<void> {
    this.logger.log(
      'Starting complete inventory batch allocation migration process...',
    );

    try {
      // Step 1: Migrate existing batches
      await this.migrateExistingBatches();

      // Step 2: Validate migration
      const isValid = await this.validateMigration();

      if (isValid) {
        this.logger.log(
          'Inventory batch allocation migration completed successfully',
        );
      } else {
        throw new Error('Migration validation failed');
      }
    } catch (error) {
      this.logger.error('Inventory batch allocation migration failed:', error);
      throw error;
    }
  }

  /**
   * Test migration with existing data (dry run)
   */
  async testMigration(): Promise<void> {
    this.logger.log(
      'Starting inventory batch allocation migration test (dry run)...',
    );

    try {
      // Validate prerequisites
      await this.validateMainStores();

      // Get batches that would be migrated
      const batchesToMigrate = await this.prisma.inventoryBatch.findMany({
        where: {
          OR: [{ storeAllocations: null }, { storeAllocations: {} }],
        },
        include: {
          inventory: {
            include: {
              tenant: {
                include: {
                  stores: {
                    where: {
                      classification: StoreClass.MAIN,
                      deletedAt: null,
                    },
                  },
                },
              },
            },
          },
        },
      });

      this.logger.log(
        `Test: Found ${batchesToMigrate.length} inventory batches that would be migrated`,
      );

      // Group by tenant for reporting
      const batchesByTenant = batchesToMigrate.reduce(
        (acc, batch) => {
          const tenantId = batch.inventory.tenant.id;
          const tenantName = batch.inventory.tenant.companyName;

          if (!acc[tenantId]) {
            acc[tenantId] = {
              tenantName,
              batches: [],
              totalQuantity: 0,
            };
          }

          acc[tenantId].batches.push(batch);
          acc[tenantId].totalQuantity += batch.remainingQuantity;

          return acc;
        },
        {} as Record<string, any>,
      );

      // Report test results
      Object.entries(batchesByTenant).forEach(([tenantId, data]) => {
        this.logger.log(
          `Test: Tenant ${data.tenantName} (${tenantId}) - ` +
            `${data.batches.length} batches, ${data.totalQuantity} total quantity`,
        );
      });

      // Validate that all batches have main stores
      const batchesWithoutMainStore = batchesToMigrate.filter(
        (batch) => batch.inventory.tenant.stores.length === 0,
      );

      if (batchesWithoutMainStore.length > 0) {
        this.logger.error(
          `Test failed: ${batchesWithoutMainStore.length} batches belong to tenants without main stores`,
        );
        throw new Error('Test failed: some tenants do not have main stores');
      }

      this.logger.log(
        'Migration test completed successfully - all prerequisites met',
      );
    } catch (error) {
      this.logger.error('Migration test failed:', error);
      throw error;
    }
  }

  /**
   * Utility method to chunk arrays for batch processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
