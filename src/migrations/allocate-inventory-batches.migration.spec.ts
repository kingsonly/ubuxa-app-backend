import { Test, TestingModule } from '@nestjs/testing';
import { AllocateInventoryBatchesMigration } from './allocate-inventory-batches.migration';
import { PrismaService } from '../prisma/prisma.service';
import { StoreClass } from '@prisma/client';
import { StoreAllocationHelper } from '../store/store-allocation.helper';

describe('AllocateInventoryBatchesMigration', () => {
  let migration: AllocateInventoryBatchesMigration;
  let prismaService: PrismaService;

  const mockPrismaService = {
    tenant: {
      findMany: jest.fn(),
    },
    inventoryBatch: {
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AllocateInventoryBatchesMigration,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    migration = module.get<AllocateInventoryBatchesMigration>(
      AllocateInventoryBatchesMigration,
    );
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateMainStores', () => {
    it('should pass validation when all tenants have main stores', async () => {
      mockPrismaService.tenant.findMany.mockResolvedValue([]);

      await expect(migration['validateMainStores']()).resolves.not.toThrow();

      expect(mockPrismaService.tenant.findMany).toHaveBeenCalledWith({
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
    });

    it('should throw error when tenants without main stores exist', async () => {
      const tenantsWithoutMainStore = [
        { id: 'tenant1', companyName: 'Company 1' },
        { id: 'tenant2', companyName: 'Company 2' },
      ];

      mockPrismaService.tenant.findMany.mockResolvedValue(
        tenantsWithoutMainStore,
      );

      await expect(migration['validateMainStores']()).rejects.toThrow(
        'Cannot proceed with inventory batch migration: some tenants do not have main stores',
      );
    });
  });

  describe('migrateExistingBatches', () => {
    it('should successfully migrate batches to main stores', async () => {
      const mockBatches = [
        {
          id: 'batch1',
          batchNumber: 1,
          remainingQuantity: 100,
          reservedQuantity: 10,
          inventory: {
            name: 'Test Inventory',
            tenant: {
              id: 'tenant1',
              stores: [{ id: 'store1', classification: StoreClass.MAIN }],
            },
          },
        },
        {
          id: 'batch2',
          batchNumber: 2,
          remainingQuantity: 50,
          reservedQuantity: 5,
          inventory: {
            name: 'Test Inventory 2',
            tenant: {
              id: 'tenant1',
              stores: [{ id: 'store1', classification: StoreClass.MAIN }],
            },
          },
        },
      ];

      // Mock validation to pass
      mockPrismaService.tenant.findMany.mockResolvedValue([]);

      // Mock batches to migrate
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(mockBatches);

      // Mock successful updates
      mockPrismaService.inventoryBatch.update.mockResolvedValue({});

      await migration.migrateExistingBatches();

      expect(mockPrismaService.inventoryBatch.findMany).toHaveBeenCalledWith({
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

      expect(mockPrismaService.inventoryBatch.update).toHaveBeenCalledTimes(2);

      // Verify the first batch update
      expect(mockPrismaService.inventoryBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch1' },
        data: {
          storeAllocations: expect.objectContaining({
            store1: expect.objectContaining({
              allocated: 100,
              reserved: 10,
              updatedBy: 'SYSTEM_MIGRATION',
            }),
          }),
        },
      });
    });

    it('should handle batches without main stores', async () => {
      const mockBatches = [
        {
          id: 'batch1',
          batchNumber: 1,
          remainingQuantity: 100,
          reservedQuantity: 10,
          inventory: {
            name: 'Test Inventory',
            tenant: {
              id: 'tenant1',
              stores: [], // No main store
            },
          },
        },
      ];

      // Mock validation to pass
      mockPrismaService.tenant.findMany.mockResolvedValue([]);

      // Mock batches to migrate
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(mockBatches);

      await expect(migration.migrateExistingBatches()).rejects.toThrow(
        'Migration completed with 1 failures',
      );
    });

    it('should handle empty batch list', async () => {
      // Mock validation to pass
      mockPrismaService.tenant.findMany.mockResolvedValue([]);

      // Mock no batches to migrate
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([]);

      await migration.migrateExistingBatches();

      expect(mockPrismaService.inventoryBatch.update).not.toHaveBeenCalled();
    });
  });

  describe('validateMigration', () => {
    it('should pass validation when all batches have correct allocations', async () => {
      // Mock no batches without allocations
      mockPrismaService.inventoryBatch.count.mockResolvedValue(0);

      // Mock batches with correct allocations
      const mockBatchesWithAllocations = [
        {
          id: 'batch1',
          batchNumber: 1,
          remainingQuantity: 100,
          reservedQuantity: 10,
          storeAllocations: {
            store1: {
              allocated: 100,
              reserved: 10,
              lastUpdated: new Date().toISOString(),
              updatedBy: 'SYSTEM_MIGRATION',
            },
          },
          inventory: { name: 'Test Inventory' },
        },
      ];

      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(
        mockBatchesWithAllocations,
      );

      const result = await migration.validateMigration();

      expect(result).toBe(true);
    });

    it('should fail validation when batches without allocations exist', async () => {
      // Mock batches without allocations
      mockPrismaService.inventoryBatch.count.mockResolvedValue(5);

      const result = await migration.validateMigration();

      expect(result).toBe(false);
    });

    it('should fail validation when allocation quantities mismatch', async () => {
      // Mock no batches without allocations
      mockPrismaService.inventoryBatch.count.mockResolvedValue(0);

      // Mock batches with incorrect allocations
      const mockBatchesWithAllocations = [
        {
          id: 'batch1',
          batchNumber: 1,
          remainingQuantity: 100,
          reservedQuantity: 10,
          storeAllocations: {
            store1: {
              allocated: 90, // Mismatch: should be 100
              reserved: 5, // Mismatch: should be 10
              lastUpdated: new Date().toISOString(),
              updatedBy: 'SYSTEM_MIGRATION',
            },
          },
          inventory: { name: 'Test Inventory' },
        },
      ];

      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(
        mockBatchesWithAllocations,
      );

      const result = await migration.validateMigration();

      expect(result).toBe(false);
    });
  });

  describe('rollbackMigration', () => {
    it('should successfully rollback migration-created allocations', async () => {
      const mockBatches = [
        {
          id: 'batch1',
          batchNumber: 1,
          storeAllocations: {
            store1: {
              allocated: 100,
              reserved: 10,
              lastUpdated: new Date().toISOString(),
              updatedBy: 'SYSTEM_MIGRATION',
            },
          },
          inventory: { name: 'Test Inventory' },
        },
        {
          id: 'batch2',
          batchNumber: 2,
          storeAllocations: {
            store1: {
              allocated: 50,
              reserved: 5,
              lastUpdated: new Date().toISOString(),
              updatedBy: 'USER_123', // Not a migration allocation
            },
          },
          inventory: { name: 'Test Inventory 2' },
        },
      ];

      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(mockBatches);
      mockPrismaService.inventoryBatch.update.mockResolvedValue({});

      await migration.rollbackMigration();

      // Should only rollback the migration-created allocation (batch1)
      expect(mockPrismaService.inventoryBatch.update).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.inventoryBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch1' },
        data: {
          storeAllocations: null,
          transferRequests: null,
        },
      });
    });

    it('should handle empty rollback list', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([]);

      await migration.rollbackMigration();

      expect(mockPrismaService.inventoryBatch.update).not.toHaveBeenCalled();
    });
  });

  describe('testMigration', () => {
    it('should successfully test migration prerequisites', async () => {
      const mockBatches = [
        {
          id: 'batch1',
          batchNumber: 1,
          remainingQuantity: 100,
          inventory: {
            tenant: {
              id: 'tenant1',
              companyName: 'Test Company',
              stores: [{ id: 'store1', classification: StoreClass.MAIN }],
            },
          },
        },
      ];

      // Mock validation to pass
      mockPrismaService.tenant.findMany.mockResolvedValue([]);

      // Mock batches to test
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(mockBatches);

      await migration.testMigration();

      expect(mockPrismaService.inventoryBatch.findMany).toHaveBeenCalled();
      // Should not call update during test
      expect(mockPrismaService.inventoryBatch.update).not.toHaveBeenCalled();
    });

    it('should fail test when batches have no main stores', async () => {
      const mockBatches = [
        {
          id: 'batch1',
          batchNumber: 1,
          remainingQuantity: 100,
          inventory: {
            tenant: {
              id: 'tenant1',
              companyName: 'Test Company',
              stores: [], // No main store
            },
          },
        },
      ];

      // Mock validation to pass
      mockPrismaService.tenant.findMany.mockResolvedValue([]);

      // Mock batches to test
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(mockBatches);

      await expect(migration.testMigration()).rejects.toThrow(
        'Test failed: some tenants do not have main stores',
      );
    });
  });

  describe('runMigration', () => {
    it('should run complete migration process successfully', async () => {
      // Mock successful migration
      mockPrismaService.tenant.findMany.mockResolvedValue([]);
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([]);
      mockPrismaService.inventoryBatch.count.mockResolvedValue(0);

      await migration.runMigration();

      // Verify both migration and validation were called
      expect(mockPrismaService.tenant.findMany).toHaveBeenCalled();
      expect(mockPrismaService.inventoryBatch.count).toHaveBeenCalled();
    });

    it('should throw error when validation fails', async () => {
      // Mock successful migration but failed validation
      mockPrismaService.tenant.findMany.mockResolvedValue([]);
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([]);
      mockPrismaService.inventoryBatch.count.mockResolvedValue(5); // Validation failure

      await expect(migration.runMigration()).rejects.toThrow(
        'Migration validation failed',
      );
    });
  });
});
