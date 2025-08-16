import { InventoryClass, InventoryStatus, StoreClass } from '@prisma/client';

export const mockStoreInventoryData = {
  tenant: {
    id: 'tenant-123',
    name: 'Test Tenant',
    createdAt: new Date(),
    updatedAt: new Date(),
  },

  stores: {
    mainStore: {
      id: 'main-store-123',
      name: 'Main Store',
      classification: StoreClass.MAIN,
      tenantId: 'tenant-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    branchStore1: {
      id: 'branch-store-123',
      name: 'Branch Store 1',
      classification: StoreClass.BRANCH,
      tenantId: 'tenant-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    branchStore2: {
      id: 'branch-store-456',
      name: 'Branch Store 2',
      classification: StoreClass.BRANCH,
      tenantId: 'tenant-123',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },

  users: {
    mainStoreUser: {
      id: 'main-user-123',
      firstname: 'Main',
      lastname: 'User',
      email: 'main@example.com',
      storeId: 'main-store-123',
    },
    branchUser1: {
      id: 'branch-user-123',
      firstname: 'Branch',
      lastname: 'User1',
      email: 'branch1@example.com',
      storeId: 'branch-store-123',
    },
    branchUser2: {
      id: 'branch-user-456',
      firstname: 'Branch',
      lastname: 'User2',
      email: 'branch2@example.com',
      storeId: 'branch-store-456',
    },
  },

  inventory: {
    id: 'inventory-123',
    name: 'Test Inventory Item',
    manufacturerName: 'Test Manufacturer',
    inventoryCategoryId: 'cat-123',
    inventorySubCategoryId: 'subcat-123',
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },

  batches: {
    mainStoreBatch: {
      id: 'batch-123',
      batchNumber: 123456,
      numberOfStock: 100,
      remainingQuantity: 100,
      price: 50.0,
      status: InventoryStatus.IN_STOCK,
      class: InventoryClass.REGULAR,
      inventoryId: 'inventory-123',
      storeAllocations: {
        'main-store-123': {
          allocated: 100,
          reserved: 0,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'main-user-123',
        },
      },
      transferRequests: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },

    multiStoreBatch: {
      id: 'batch-456',
      batchNumber: 456789,
      numberOfStock: 200,
      remainingQuantity: 200,
      price: 75.0,
      status: InventoryStatus.IN_STOCK,
      class: InventoryClass.REGULAR,
      inventoryId: 'inventory-123',
      storeAllocations: {
        'main-store-123': {
          allocated: 100,
          reserved: 10,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'main-user-123',
        },
        'branch-store-123': {
          allocated: 50,
          reserved: 5,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'branch-user-123',
        },
        'branch-store-456': {
          allocated: 50,
          reserved: 0,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'branch-user-456',
        },
      },
      transferRequests: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },

    migratedBatch: {
      id: 'batch-789',
      batchNumber: 789012,
      numberOfStock: 150,
      remainingQuantity: 150,
      price: 60.0,
      status: InventoryStatus.IN_STOCK,
      class: InventoryClass.REGULAR,
      inventoryId: 'inventory-123',
      storeAllocations: {
        'main-store-123': {
          allocated: 150,
          reserved: 0,
          lastUpdated: new Date().toISOString(),
          updatedBy: 'SYSTEM_MIGRATION',
        },
      },
      transferRequests: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },

    unmigratedBatch: {
      id: 'batch-unmigrated',
      batchNumber: 999999,
      numberOfStock: 80,
      remainingQuantity: 80,
      price: 40.0,
      status: InventoryStatus.IN_STOCK,
      class: InventoryClass.REGULAR,
      inventoryId: 'inventory-123',
      storeAllocations: null,
      transferRequests: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
  },

  transferRequests: {
    pendingRequest: {
      id: 'request-pending-123',
      type: 'TRANSFER',
      sourceStoreId: 'main-store-123',
      targetStoreId: 'branch-store-123',
      requestedQuantity: 30,
      status: 'PENDING',
      reason: 'Branch store inventory exhausted',
      requestedBy: 'branch-user-123',
      requestedAt: new Date().toISOString(),
      requestedByName: 'Branch User1',
    },

    approvedRequest: {
      id: 'request-approved-456',
      type: 'TRANSFER',
      sourceStoreId: 'main-store-123',
      targetStoreId: 'branch-store-456',
      requestedQuantity: 40,
      approvedQuantity: 35,
      status: 'APPROVED',
      reason: 'Restocking branch store',
      requestedBy: 'branch-user-456',
      requestedAt: new Date().toISOString(),
      requestedByName: 'Branch User2',
      approvedBy: 'main-user-123',
      approvedAt: new Date().toISOString(),
      approvedByName: 'Main User',
    },

    completedRequest: {
      id: 'request-completed-789',
      type: 'TRANSFER',
      sourceStoreId: 'main-store-123',
      targetStoreId: 'branch-store-123',
      requestedQuantity: 25,
      approvedQuantity: 25,
      status: 'COMPLETED',
      reason: 'Regular restocking',
      requestedBy: 'branch-user-123',
      requestedAt: new Date().toISOString(),
      requestedByName: 'Branch User1',
      approvedBy: 'main-user-123',
      approvedAt: new Date().toISOString(),
      approvedByName: 'Main User',
      confirmedBy: 'branch-user-123',
      confirmedAt: new Date().toISOString(),
      confirmedByName: 'Branch User1',
    },

    rejectedRequest: {
      id: 'request-rejected-101',
      type: 'TRANSFER',
      sourceStoreId: 'main-store-123',
      targetStoreId: 'branch-store-456',
      requestedQuantity: 60,
      status: 'REJECTED',
      reason: 'Emergency restocking',
      rejectionReason: 'Insufficient inventory available',
      requestedBy: 'branch-user-456',
      requestedAt: new Date().toISOString(),
      requestedByName: 'Branch User2',
      approvedBy: 'main-user-123',
      approvedAt: new Date().toISOString(),
      approvedByName: 'Main User',
    },
  },

  categories: {
    inventoryCategory: {
      id: 'cat-123',
      name: 'Test Category',
      parentId: null,
      type: 'INVENTORY',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    inventorySubCategory: {
      id: 'subcat-123',
      name: 'Test SubCategory',
      parentId: 'cat-123',
      type: 'INVENTORY',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
};

export const createMockInventoryWithBatches = (batches: any[]) => ({
  ...mockStoreInventoryData.inventory,
  batches,
  inventoryCategory: mockStoreInventoryData.categories.inventoryCategory,
  inventorySubCategory: mockStoreInventoryData.categories.inventorySubCategory,
});

export const createMockBatchWithRequests = (
  baseBatch: any,
  requests: Record<string, any>,
) => ({
  ...baseBatch,
  transferRequests: requests,
});

export const createMockStoreAllocation = (
  storeId: string,
  allocated: number,
  reserved: number = 0,
  updatedBy: string = 'test-user',
) => ({
  [storeId]: {
    allocated,
    reserved,
    lastUpdated: new Date().toISOString(),
    updatedBy,
  },
});
