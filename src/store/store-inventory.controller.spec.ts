import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { StoreInventoryController } from './store-inventory.controller';
import { StoreInventoryService } from './store-inventory.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { ApproveTransferDto } from './dto/approve-transfer.dto';
import { PendingRequestsQueryDto } from './dto/transfer-request-response.dto';
import { RolesAndPermissionsGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

describe('StoreInventoryController', () => {
  let controller: StoreInventoryController;
  let service: StoreInventoryService;

  const mockStoreInventoryService = {
    getStoreInventoryView: jest.fn(),
    createTransferRequest: jest.fn(),
    approveTransferRequest: jest.fn(),
    confirmTransferRequest: jest.fn(),
    getPendingRequests: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
    getAll: jest.fn(),
    getAllAndOverride: jest.fn(),
    getAllAndMerge: jest.fn(),
  };

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
    },
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  const mockRolesAndPermissionsGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoreInventoryController],
      providers: [
        {
          provide: StoreInventoryService,
          useValue: mockStoreInventoryService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesAndPermissionsGuard)
      .useValue(mockRolesAndPermissionsGuard)
      .compile();

    controller = module.get<StoreInventoryController>(StoreInventoryController);
    service = module.get<StoreInventoryService>(StoreInventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStoreInventory', () => {
    it('should return store inventory view', async () => {
      const storeId = 'store-123';
      const mockInventoryView = [
        {
          inventoryId: 'inv-123',
          inventoryName: 'Test Inventory',
          batches: [],
          totalAllocated: 100,
          totalAvailable: 80,
        },
      ];

      mockStoreInventoryService.getStoreInventoryView.mockResolvedValue(
        mockInventoryView,
      );

      const result = await controller.getStoreInventory(storeId);

      expect(service.getStoreInventoryView).toHaveBeenCalledWith(storeId);
      expect(result).toEqual(mockInventoryView);
    });
  });

  describe('createTransferRequest', () => {
    it('should create a transfer request and return request ID', async () => {
      const storeId = 'store-123';
      const userId = 'user-123';
      const requestId = 'request-123';
      const createDto: CreateTransferRequestDto = {
        type: 'TRANSFER',
        inventoryBatchId: 'batch-123',
        requestedQuantity: 10,
        sourceStoreId: 'source-store-123',
        reason: 'Need more inventory',
      };

      mockStoreInventoryService.createTransferRequest.mockResolvedValue(
        requestId,
      );

      const result = await controller.createTransferRequest(
        storeId,
        createDto,
        userId,
      );

      expect(service.createTransferRequest).toHaveBeenCalledWith(
        createDto,
        userId,
      );
      expect(result).toEqual({ requestId });
    });
  });

  describe('approveTransferRequest', () => {
    it('should approve a transfer request', async () => {
      const requestId = 'request-123';
      const userId = 'user-123';
      const approveDto: ApproveTransferDto = {
        decision: 'APPROVED',
        approvedQuantity: 8,
      };

      mockStoreInventoryService.approveTransferRequest.mockResolvedValue(
        undefined,
      );

      await controller.approveTransferRequest(requestId, approveDto, userId);

      expect(service.approveTransferRequest).toHaveBeenCalledWith(
        requestId,
        approveDto,
        userId,
      );
    });
  });

  describe('confirmTransferRequest', () => {
    it('should confirm a transfer request', async () => {
      const requestId = 'request-123';
      const userId = 'user-123';

      mockStoreInventoryService.confirmTransferRequest.mockResolvedValue(
        undefined,
      );

      await controller.confirmTransferRequest(requestId, userId);

      expect(service.confirmTransferRequest).toHaveBeenCalledWith(
        requestId,
        userId,
      );
    });
  });

  describe('getStoreTransferRequests', () => {
    it('should return transfer requests for a store', async () => {
      const storeId = 'store-123';
      const query: PendingRequestsQueryDto = {
        status: 'PENDING',
        type: 'TRANSFER',
      };
      const mockRequests = [
        {
          requestId: 'request-123',
          type: 'TRANSFER' as const,
          sourceStoreId: 'source-123',
          sourceStoreName: 'Source Store',
          targetStoreId: 'target-123',
          targetStoreName: 'Target Store',
          inventoryBatchId: 'batch-123',
          inventoryName: 'Test Inventory',
          batchNumber: 1,
          requestedQuantity: 10,
          status: 'PENDING' as const,
          requestedBy: 'user-123',
          requestedByName: 'John Doe',
          requestedAt: '2023-01-01T00:00:00Z',
        },
      ];

      mockStoreInventoryService.getPendingRequests.mockResolvedValue(
        mockRequests,
      );

      const result = await controller.getStoreTransferRequests(storeId, query);

      expect(service.getPendingRequests).toHaveBeenCalledWith(storeId, query);
      expect(result).toEqual(mockRequests);
    });
  });
});
