import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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

describe('StoreInventoryService - Error Handling', () => {
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

    // Reset all mocks
    jest.clearAllMocks();
  });

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
  });

  describe('confirmTransferRequest', () => {
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
  });
});
