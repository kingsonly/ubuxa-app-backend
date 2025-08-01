/**
 * Integration Test for Simplified Batch Inventory System
 * 
 * This test demonstrates the simplified batch inventory functionality
 * and can be used to verify the system works correctly.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StoreBatchInventoryService } from './store-batch-inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoreContext } from './context/store.context';
import { TenantContext } from '../tenants/context/tenant.context';

describe('Simplified Batch Inventory System', () => {
  let service: StoreBatchInventoryService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreBatchInventoryService,
        {
          provide: PrismaService,
          useValue: {
            // Mock Prisma service for testing
            store: { findFirst: jest.fn() },
            inventory: { findFirst: jest.fn() },
            inventoryBatch: { findFirst: jest.fn(), findMany: jest.fn() },
            storeInventory: { 
              findFirst: jest.fn(), 
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn()
            },
            storeTransfer: { create: jest.fn() },
            $transaction: jest.fn()
          }
        },
        {
          provide: StoreContext,
          useValue: { getCurrentStoreId: jest.fn() }
        },
        {
          provide: TenantContext,
          useValue: { requireTenantId: jest.fn().mockReturnValue('tenant-123') }
        }
      ]
    }).compile();

    service = module.get<StoreBatchInventoryService>(StoreBatchInventoryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('addInventoryToStore', () => {
    it('should add aggregate inventory when no batchId provided', async () => {
      // Mock store and inventory existence
      (prisma.store.findFirst as jest.Mock).mockResolvedValue({ id: 'store-1' });
      (prisma.inventory.findFirst as jest.Mock).mockResolvedValue({ id: 'inv-1' });
      
      // Mock transaction
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const mockTx = {
          storeInventory: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'store-inv-1',
              storeId: 'store-1',
              inventoryId: 'inv-1',
              inventoryBatchId: null,
              quantity: 100
            })
          }
        };
        return callback(mockTx);
      });
      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      const result = await service.addInventoryToStore('store-1', {
        inventoryId: 'inv-1',
        quantity: 100
      });

      expect(result.inventoryBatchId).toBeNull();
      expect(result.quantity).toBe(100);
    });

    it('should add batch-specific inventory when batchId provided', async () => {
      // Mock store, inventory, and batch existence
      (prisma.store.findFirst as jest.Mock).mockResolvedValue({ id: 'store-1' });
      (prisma.inventory.findFirst as jest.Mock).mockResolvedValue({ id: 'inv-1' });
      (prisma.inventoryBatch.findFirst as jest.Mock).mockResolvedValue({ id: 'batch-1' });
      
      // Mock transaction
      const mockTransaction = jest.fn().mockImplementation(async (callback) => {
        const mockTx = {
          storeInventory: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'store-inv-1',
              storeId: 'store-1',
              inventoryId: 'inv-1',
              inventoryBatchId: 'batch-1',
              quantity: 50,
              pricePerUnit: 25.00
            })
          }
        };
        return callback(mockTx);
      });
      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      const result = await service.addInventoryToStore('store-1', {
        inventoryId: 'inv-1',
        quantity: 50,
        batchId: 'batch-1',
        pricePerUnit: 25.00
      });

      expect(result.inventoryBatchId).toBe('batch-1');
      expect(result.quantity).toBe(50);
      expect(result.pricePerUnit).toBe(25.00);
    });
  });

  describe('getStoreInventory', () => {
    it('should return aggregate inventory when includeBatches is false', async () => {
      const mockInventory = [
        {
          id: 'store-inv-1',
          storeId: 'store-1',
          inventoryId: 'inv-1',
          inventoryBatchId: null,
          quantity: 100
        }
      ];

      (prisma.storeInventory.findMany as jest.Mock).mockResolvedValue(mockInventory);

      const result = await service.getStoreInventory('store-1', false);

      expect(result).toEqual(mockInventory);
      expect(prisma.storeInventory.findMany).toHaveBeenCalledWith({
        where: { 
          storeId: 'store-1', 
          tenantId: 'tenant-123',
          inventoryBatchId: null 
        },
        include: {
          inventory: true,
          store: true
        }
      });
    });

    it('should return all inventory including batches when includeBatches is true', async () => {
      const mockInventory = [
        {
          id: 'store-inv-1',
          storeId: 'store-1',
          inventoryId: 'inv-1',
          inventoryBatchId: null,
          quantity: 100
        },
        {
          id: 'store-inv-2',
          storeId: 'store-1',
          inventoryId: 'inv-1',
          inventoryBatchId: 'batch-1',
          quantity: 50
        }
      ];

      (prisma.storeInventory.findMany as jest.Mock).mockResolvedValue(mockInventory);

      const result = await service.getStoreInventory('store-1', true);

      expect(result).toEqual(mockInventory);
      expect(prisma.storeInventory.findMany).toHaveBeenCalledWith({
        where: { storeId: 'store-1', tenantId: 'tenant-123' },
        include: {
          inventory: true,
          inventoryBatch: true,
          store: true
        },
        orderBy: [
          { inventoryId: 'asc' },
          { inventoryBatchId: 'asc' }
        ]
      });
    });
  });

  describe('autoAllocateInventory', () => {
    it('should allocate inventory using FIFO strategy', async () => {
      const mockBatches = [
        { id: 'batch-1', batchNumber: 'B001', remainingQuantity: 30, price: 20.00 },
        { id: 'batch-2', batchNumber: 'B002', remainingQuantity: 50, price: 22.00 }
      ];

      (prisma.inventoryBatch.findMany as jest.Mock).mockResolvedValue(mockBatches);

      // Mock the addInventoryToStore calls
      const addInventorySpy = jest.spyOn(service, 'addInventoryToStore').mockResolvedValue({} as any);

      const result = await service.autoAllocateInventory('store-1', 'inv-1', 60, 'FIFO');

      expect(result.fullyAllocated).toBe(true);
      expect(result.shortfall).toBe(0);
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations[0]).toEqual({
        batchId: 'batch-1',
        batchNumber: 'B001',
        quantity: 30
      });
      expect(result.allocations[1]).toEqual({
        batchId: 'batch-2',
        batchNumber: 'B002',
        quantity: 30
      });

      expect(addInventorySpy).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Example Usage Scenarios
 * 
 * These examples show how the simplified system would be used in practice:
 */

export const exampleUsage = {
  // 1. Add aggregate inventory
  addAggregateInventory: async (service: StoreBatchInventoryService) => {
    return await service.addInventoryToStore('store-1', {
      inventoryId: 'inv-123',
      quantity: 100
    });
  },

  // 2. Add batch-specific inventory
  addBatchInventory: async (service: StoreBatchInventoryService) => {
    return await service.addInventoryToStore('store-1', {
      inventoryId: 'inv-123',
      quantity: 50,
      batchId: 'batch-001',
      pricePerUnit: 25.00
    });
  },

  // 3. Get aggregate view
  getAggregateView: async (service: StoreBatchInventoryService) => {
    return await service.getStoreInventory('store-1', false);
  },

  // 4. Get detailed view with batches
  getDetailedView: async (service: StoreBatchInventoryService) => {
    return await service.getStoreInventory('store-1', true);
  },

  // 5. Transfer aggregate inventory
  transferAggregate: async (service: StoreBatchInventoryService) => {
    return await service.transferInventory({
      fromStoreId: 'store-1',
      toStoreId: 'store-2',
      inventoryId: 'inv-123',
      quantity: 25,
      notes: 'Regular transfer'
    });
  },

  // 6. Transfer specific batch
  transferBatch: async (service: StoreBatchInventoryService) => {
    return await service.transferInventory({
      fromStoreId: 'store-1',
      toStoreId: 'store-2',
      inventoryId: 'inv-123',
      quantity: 25,
      batchId: 'batch-001',
      notes: 'Batch-specific transfer'
    });
  },

  // 7. Auto-allocate with FIFO
  autoAllocateFIFO: async (service: StoreBatchInventoryService) => {
    return await service.autoAllocateInventory('store-1', 'inv-123', 100, 'FIFO');
  }
};