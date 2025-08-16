import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StoreInventoryService } from './store-inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenants/context/tenant.context';
import { StoreService } from './store.service';
import { UsersService } from '../users/users.service';
import {
  InsufficientStoreAllocationError,
  StoreAccessDeniedError,
  InvalidTransferRequestError,
  TransferRequestNotFoundError,
  InvalidTransferRequestStateError,
  StoreNotFoundError,
  InventoryBatchNotFoundError,
  TransferRequestConflictError,
} from './exceptions/store-inventory.exceptions';

describe('StoreInventoryService', () => {
  let service: StoreInventoryService;

  const mockPrismaService = {
    inventoryBatch: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockTenantContext = {
    requireTenantId: jest.fn().mockReturnValue('tenant-123'),
  };

  const mockStoreService = {
    findOne: jest.fn(),
    findAllByTenant: jest.fn(),
    findMainStore: jest.fn(),
  };

  const mockUsersService = {
    fetchUserByUserId: jest.fn().mockResolvedValue({
      id: 'user-123',
      firstname: 'John',
      lastname: 'Doe',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreInventoryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: StoreService, useValue: mockStoreService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<StoreInventoryService>(StoreInventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('confirmTransferRequest', () => {
    it('should throw InvalidTransferRequestError when userId is empty', async () => {
      await expect(
        service.confirmTransferRequest('request-123', ''),
      ).rejects.toThrow(InvalidTransferRequestError);
    });

    it('should throw TransferRequestNotFoundError when batch is not found', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([]);

      await expect(
        service.confirmTransferRequest('request-123', 'user-123'),
      ).rejects.toThrow(TransferRequestNotFoundError);
    });
  });

  describe('getPendingRequests', () => {
    const mockStores = [
      { id: 'store-1', name: 'Main Store' },
      { id: 'store-2', name: 'Branch Store' },
      { id: 'store-3', name: 'Another Store' },
    ];

    const mockBatches = [
      {
        id: 'batch-1',
        batchNumber: 1,
        inventory: { id: 'inv-1', name: 'Test Inventory' },
        transferRequests: {
          'request-1': {
            type: 'TRANSFER',
            sourceStoreId: 'store-1',
            targetStoreId: 'store-2',
            requestedQuantity: 10,
            approvedQuantity: 8,
            status: 'APPROVED',
            reason: 'Need more stock',
            requestedBy: 'user-1',
            requestedByName: 'John Doe',
            requestedAt: '2024-01-01T10:00:00Z',
            approvedBy: 'user-2',
            approvedByName: 'Jane Smith',
            approvedAt: '2024-01-01T11:00:00Z',
          },
          'request-2': {
            type: 'ALLOCATION',
            sourceStoreId: 'store-1',
            targetStoreId: 'store-3',
            requestedQuantity: 5,
            status: 'PENDING',
            requestedBy: 'user-3',
            requestedByName: 'Bob Wilson',
            requestedAt: '2024-01-02T09:00:00Z',
          },
        },
      },
      {
        id: 'batch-2',
        batchNumber: 2,
        inventory: { id: 'inv-2', name: 'Another Inventory' },
        transferRequests: {
          'request-3': {
            type: 'TRANSFER',
            sourceStoreId: 'store-2',
            targetStoreId: 'store-1',
            requestedQuantity: 15,
            status: 'REJECTED',
            reason: 'Urgent need',
            requestedBy: 'user-4',
            requestedByName: 'Alice Brown',
            requestedAt: '2024-01-03T14:00:00Z',
            approvedBy: 'user-1',
            approvedByName: 'John Doe',
            approvedAt: '2024-01-03T15:00:00Z',
            rejectionReason: 'Insufficient stock',
          },
        },
      },
    ];

    beforeEach(() => {
      mockStoreService.findOne.mockResolvedValue({
        id: 'store-1',
        name: 'Main Store',
      });
      mockStoreService.findAllByTenant.mockResolvedValue(mockStores);
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(mockBatches);
    });

    it('should return all requests for a store without filters', async () => {
      const result = await service.getPendingRequests('store-1');

      expect(result).toHaveLength(3); // store-1 is involved in all 3 requests
      // Sorted by date: request-3 (2024-01-03), request-2 (2024-01-02), request-1 (2024-01-01)
      expect(result[0].requestId).toBe('request-3'); // Most recent first
      expect(result[1].requestId).toBe('request-2');
      expect(result[2].requestId).toBe('request-1');
    });

    it('should filter requests by status', async () => {
      const result = await service.getPendingRequests('store-1', {
        status: 'PENDING',
      });

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('request-2');
      expect(result[0].status).toBe('PENDING');
    });

    it('should filter requests by type', async () => {
      const result = await service.getPendingRequests('store-1', {
        type: 'TRANSFER',
      });

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.type === 'TRANSFER')).toBe(true);
    });

    it('should filter requests by source store', async () => {
      const result = await service.getPendingRequests('store-1', {
        sourceStoreId: 'store-2',
      });

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('request-3');
      expect(result[0].sourceStoreId).toBe('store-2');
    });

    it('should filter requests by target store', async () => {
      const result = await service.getPendingRequests('store-1', {
        targetStoreId: 'store-2',
      });

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('request-1');
      expect(result[0].targetStoreId).toBe('store-2');
    });

    it('should return empty array when no requests match filters', async () => {
      const result = await service.getPendingRequests('store-1', {
        status: 'COMPLETED',
      });

      expect(result).toHaveLength(0);
    });

    it('should return empty array for store with no requests', async () => {
      const result = await service.getPendingRequests('store-3');

      expect(result).toHaveLength(1); // Only request-2 targets store-3
      expect(result[0].requestId).toBe('request-2');
    });

    it('should include proper store names in response', async () => {
      const result = await service.getPendingRequests('store-1');

      const request = result.find((r) => r.requestId === 'request-1');
      expect(request?.sourceStoreName).toBe('Main Store');
      expect(request?.targetStoreName).toBe('Branch Store');
    });

    it('should handle unknown store names gracefully', async () => {
      const batchesWithUnknownStore = [
        {
          ...mockBatches[0],
          transferRequests: {
            'request-unknown': {
              type: 'TRANSFER',
              sourceStoreId: 'unknown-store',
              targetStoreId: 'store-1',
              requestedQuantity: 5,
              status: 'PENDING',
              requestedBy: 'user-1',
              requestedByName: 'Test User',
              requestedAt: '2024-01-01T10:00:00Z',
            },
          },
        },
      ];

      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(
        batchesWithUnknownStore,
      );

      const result = await service.getPendingRequests('store-1');

      expect(result).toHaveLength(1);
      expect(result[0].sourceStoreName).toBe('Unknown Store');
    });

    it('should sort requests by requested date (most recent first)', async () => {
      const result = await service.getPendingRequests('store-1');

      // Verify sorting order
      const dates = result.map((r) => new Date(r.requestedAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
      }
    });

    it('should include all required fields in response DTOs', async () => {
      const result = await service.getPendingRequests('store-1');

      const request = result.find((r) => r.requestId === 'request-1');
      expect(request).toMatchObject({
        requestId: 'request-1',
        type: 'TRANSFER',
        sourceStoreId: 'store-1',
        sourceStoreName: 'Main Store',
        targetStoreId: 'store-2',
        targetStoreName: 'Branch Store',
        inventoryBatchId: 'batch-1',
        inventoryName: 'Test Inventory',
        batchNumber: 1,
        requestedQuantity: 10,
        approvedQuantity: 8,
        status: 'APPROVED',
        reason: 'Need more stock',
        requestedBy: 'user-1',
        requestedByName: 'John Doe',
        requestedAt: '2024-01-01T10:00:00Z',
        approvedBy: 'user-2',
        approvedByName: 'Jane Smith',
        approvedAt: '2024-01-01T11:00:00Z',
      });
    });

    it('should handle batches with no transfer requests', async () => {
      const batchesWithoutRequests = [
        {
          id: 'batch-empty',
          batchNumber: 3,
          inventory: { id: 'inv-3', name: 'Empty Inventory' },
          transferRequests: {},
        },
      ];

      mockPrismaService.inventoryBatch.findMany.mockResolvedValue(
        batchesWithoutRequests,
      );

      const result = await service.getPendingRequests('store-1');

      expect(result).toHaveLength(0);
    });

    it('should verify store exists before processing', async () => {
      mockStoreService.findOne.mockRejectedValue(
        new NotFoundException('Store not found'),
      );

      await expect(service.getPendingRequests('invalid-store')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should combine multiple filters correctly', async () => {
      const result = await service.getPendingRequests('store-1', {
        status: 'APPROVED',
        type: 'TRANSFER',
        targetStoreId: 'store-2',
      });

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('request-1');
      expect(result[0].status).toBe('APPROVED');
      expect(result[0].type).toBe('TRANSFER');
      expect(result[0].targetStoreId).toBe('store-2');
    });
  });

  // Comprehensive Error Handling Tests
  describe('Error Handling', () => {
  describe('allocateBatchToStore', () => {
    it('should throw InvalidTransferRequestError for non-positive quantity', async () => {
      await expect(
        service.allocateBatchToStore('batch-1', 'store-1', 0, 'user-1'),
      ).rejects.toThrow(InvalidTransferRequestError);

      await expect(
        service.allocateBatchToStore('batch-1', 'store-1', -5, 'user-1'),
      ).rejects.toThrow(InvalidTransferRequestError);
    });

    it('should throw StoreNotFoundError when store does not exist', async () => {
      mockStoreService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.allocateBatchToStore('batch-1', 'invalid-store', 10, 'user-1'),
      ).rejects.toThrow(StoreNotFoundError);
    });

    it('should throw InventoryBatchNotFoundError when batch does not exist', async () => {
      mockStoreService.findOne.mockResolvedValue({ id: 'store-1' });
      mockPrismaService.inventoryBatch.findFirst.mockResolvedValue(null);

      await expect(
        service.allocateBatchToStore('invalid-batch', 'store-1', 10, 'user-1'),
      ).rejects.toThrow(InventoryBatchNotFoundError);
    });

    it('should throw InsufficientStoreAllocationError when not enough unallocated quantity', async () => {
      mockStoreService.findOne.mockResolvedValue({ id: 'store-1' });
      mockPrismaService.inventoryBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        remainingQuantity: 100,
        storeAllocations: {
          'store-2': { allocated: 80, reserved: 0 },
        },
      });

      await expect(
        service.allocateBatchToStore('batch-1', 'store-1', 30, 'user-1'),
      ).rejects.toThrow(InsufficientStoreAllocationError);
    });
  });

  describe('getStoreInventoryView', () => {
    it('should throw StoreNotFoundError when store does not exist', async () => {
      mockStoreService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.getStoreInventoryView('invalid-store'),
      ).rejects.toThrow(StoreNotFoundError);
    });
  });

  describe('createTransferRequest', () => {
    const validDto = {
      type: 'TRANSFER' as const,
      inventoryBatchId: 'batch-1',
      requestedQuantity: 10,
      sourceStoreId: 'store-1',
    };

    beforeEach(() => {
      mockStoreService.findOne.mockResolvedValue({ id: 'store-1' });
      mockStoreService.findAllByTenant.mockResolvedValue([
        { id: 'store-1', name: 'Store 1' },
        { id: 'store-2', name: 'Store 2' },
      ]);
    });

    it('should throw InvalidTransferRequestError when userId is empty', async () => {
      await expect(service.createTransferRequest(validDto, '')).rejects.toThrow(
        InvalidTransferRequestError,
      );
    });

    it('should throw InventoryBatchNotFoundError when batch does not exist', async () => {
      mockPrismaService.inventoryBatch.findFirst.mockResolvedValue(null);

      await expect(
        service.createTransferRequest(validDto, 'user-1'),
      ).rejects.toThrow(InventoryBatchNotFoundError);
    });

    it('should throw InvalidTransferRequestError when source store is missing for transfer', async () => {
      const invalidDto = { ...validDto, sourceStoreId: undefined };

      await expect(
        service.createTransferRequest(invalidDto, 'user-1'),
      ).rejects.toThrow(InvalidTransferRequestError);
    });

    it('should throw InvalidTransferRequestError when target store is missing for allocation', async () => {
      const allocationDto = {
        ...validDto,
        type: 'ALLOCATION' as const,
        sourceStoreId: undefined,
      };
      mockStoreService.findMainStore.mockResolvedValue({ id: 'main-store' });

      await expect(
        service.createTransferRequest(allocationDto, 'user-1'),
      ).rejects.toThrow(InvalidTransferRequestError);
    });

    it('should throw StoreNotFoundError when source or target store does not exist', async () => {
      mockStoreService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.createTransferRequest(validDto, 'user-1'),
      ).rejects.toThrow(StoreNotFoundError);
    });

    it('should throw InsufficientStoreAllocationError when source store has insufficient allocation', async () => {
      mockPrismaService.inventoryBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        storeAllocations: {
          'store-1': { allocated: 5, reserved: 0 },
        },
        transferRequests: {},
      });

      await expect(
        service.createTransferRequest(validDto, 'user-1'),
      ).rejects.toThrow(InsufficientStoreAllocationError);
    });

    it('should throw TransferRequestConflictError when pending request already exists', async () => {
      mockPrismaService.inventoryBatch.findFirst.mockResolvedValue({
        id: 'batch-1',
        storeAllocations: {
          'store-1': { allocated: 20, reserved: 0 },
        },
        transferRequests: {
          'existing-request': {
            targetStoreId: 'store-2',
            status: 'PENDING',
          },
        },
      });

      await expect(
        service.createTransferRequest(validDto, 'user-1'),
      ).rejects.toThrow(TransferRequestConflictError);
    });
  });

  describe('approveTransferRequest', () => {
    const validDto = {
      decision: 'APPROVED' as const,
      approvedQuantity: 8,
    };

    beforeEach(() => {
      mockStoreService.findOne.mockResolvedValue({ id: 'store-1' });
    });

    it('should throw InvalidTransferRequestError when userId is empty', async () => {
      await expect(
        service.approveTransferRequest('request-1', validDto, ''),
      ).rejects.toThrow(InvalidTransferRequestError);
    });

    it('should throw TransferRequestNotFoundError when request does not exist', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([]);

      await expect(
        service.approveTransferRequest('invalid-request', validDto, 'user-1'),
      ).rejects.toThrow(TransferRequestNotFoundError);
    });

    it('should throw InvalidTransferRequestStateError when request is not pending', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          transferRequests: {
            'request-1': {
              status: 'APPROVED',
              sourceStoreId: 'store-1',
            },
          },
        },
      ]);

      await expect(
        service.approveTransferRequest('request-1', validDto, 'user-1'),
      ).rejects.toThrow(InvalidTransferRequestStateError);
    });

    it('should throw StoreAccessDeniedError when user cannot access source store', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          transferRequests: {
            'request-1': {
              status: 'PENDING',
              sourceStoreId: 'store-1',
            },
          },
        },
      ]);
      mockStoreService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.approveTransferRequest('request-1', validDto, 'user-1'),
      ).rejects.toThrow(StoreAccessDeniedError);
    });

    it('should throw InvalidTransferRequestError for invalid approved quantity', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          transferRequests: {
            'request-1': {
              status: 'PENDING',
              sourceStoreId: 'store-1',
              requestedQuantity: 10,
            },
          },
        },
      ]);

      // Test negative quantity
      await expect(
        service.approveTransferRequest(
          'request-1',
          { ...validDto, approvedQuantity: -1 },
          'user-1',
        ),
      ).rejects.toThrow(InvalidTransferRequestError);

      // Test quantity exceeding requested
      await expect(
        service.approveTransferRequest(
          'request-1',
          { ...validDto, approvedQuantity: 15 },
          'user-1',
        ),
      ).rejects.toThrow(InvalidTransferRequestError);
    });

    it('should throw InsufficientStoreAllocationError when source store lacks allocation', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          storeAllocations: {
            'store-1': { allocated: 5, reserved: 0 },
          },
          transferRequests: {
            'request-1': {
              status: 'PENDING',
              sourceStoreId: 'store-1',
              requestedQuantity: 10,
            },
          },
        },
      ]);

      await expect(
        service.approveTransferRequest('request-1', validDto, 'user-1'),
      ).rejects.toThrow(InsufficientStoreAllocationError);
    });

    it('should throw InvalidTransferRequestError when rejection reason is missing', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          transferRequests: {
            'request-1': {
              status: 'PENDING',
              sourceStoreId: 'store-1',
            },
          },
        },
      ]);

      const rejectionDto = {
        decision: 'REJECTED' as const,
      };

      await expect(
        service.approveTransferRequest('request-1', rejectionDto, 'user-1'),
      ).rejects.toThrow(InvalidTransferRequestError);
    });
  });

  describe('confirmTransferRequest', () => {
    beforeEach(() => {
      mockStoreService.findOne.mockResolvedValue({ id: 'store-1' });
    });

    it('should throw InvalidTransferRequestError when userId is empty', async () => {
      await expect(
        service.confirmTransferRequest('request-1', ''),
      ).rejects.toThrow(InvalidTransferRequestError);
    });

    it('should throw TransferRequestNotFoundError when request does not exist', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([]);

      await expect(
        service.confirmTransferRequest('invalid-request', 'user-1'),
      ).rejects.toThrow(TransferRequestNotFoundError);
    });

    it('should throw InvalidTransferRequestStateError when request is not approved', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          transferRequests: {
            'request-1': {
              status: 'PENDING',
              targetStoreId: 'store-1',
            },
          },
        },
      ]);

      await expect(
        service.confirmTransferRequest('request-1', 'user-1'),
      ).rejects.toThrow(InvalidTransferRequestStateError);
    });

    it('should throw StoreAccessDeniedError when user cannot access target store', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          transferRequests: {
            'request-1': {
              status: 'APPROVED',
              targetStoreId: 'store-1',
            },
          },
        },
      ]);
      mockStoreService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.confirmTransferRequest('request-1', 'user-1'),
      ).rejects.toThrow(StoreAccessDeniedError);
    });

    it('should throw InsufficientStoreAllocationError when source store lacks allocation', async () => {
      mockPrismaService.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          storeAllocations: {
            'store-1': { allocated: 5, reserved: 0 },
          },
          transferRequests: {
            'request-1': {
              status: 'APPROVED',
              sourceStoreId: 'store-1',
              targetStoreId: 'store-2',
              approvedQuantity: 10,
            },
          },
        },
      ]);

      await expect(
        service.confirmTransferRequest('request-1', 'user-1'),
      ).rejects.toThrow(InsufficientStoreAllocationError);
    });
  });

  describe('getPendingRequests', () => {
    it('should throw StoreNotFoundError when store does not exist', async () => {
      mockStoreService.findOne.mockRejectedValue(new NotFoundException());

      await expect(service.getPendingRequests('invalid-store')).rejects.toThrow(
        StoreNotFoundError,
      );
    });
  });
});
}