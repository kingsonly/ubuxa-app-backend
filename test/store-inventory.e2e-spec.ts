import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import {
  PrismaClient,
  InventoryClass,
  InventoryStatus,
  StoreClass,
} from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { RolesAndPermissionsGuard } from '../src/auth/guards/roles.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt.guard';
import { TenantContext } from '../src/tenants/context/tenant.context';

describe('StoreInventoryController (e2e)', () => {
  let app: INestApplication;
  let prisma: DeepMockProxy<PrismaClient>;

  // Mock data
  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Tenant',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMainStore = {
    id: 'main-store-123',
    name: 'Main Store',
    description: 'Main Store Description',
    address: '123 Main St',
    phone: '+1234567890',
    email: 'main@store.com',
    classification: StoreClass.MAIN,
    isActive: true,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockBranchStore = {
    id: 'branch-store-123',
    name: 'Branch Store',
    description: 'Branch Store Description',
    address: '456 Branch St',
    phone: '+1234567891',
    email: 'branch@store.com',
    classification: StoreClass.BRANCH,
    isActive: true,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockSecondBranchStore = {
    id: 'branch-store-456',
    name: 'Second Branch Store',
    description: 'Second Branch Store Description',
    address: '789 Second St',
    phone: '+1234567892',
    email: 'second@store.com',
    classification: StoreClass.BRANCH,
    isActive: true,
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockUser = {
    id: 'user-123',
    firstname: 'John',
    lastname: 'Doe',
    email: 'john@example.com',
    storeId: 'branch-store-123',
  };

  const mockMainStoreUser = {
    id: 'main-user-123',
    firstname: 'Main',
    lastname: 'User',
    email: 'main@example.com',
    storeId: 'main-store-123',
  };

  const mockInventory = {
    id: 'inventory-123',
    name: 'Test Inventory',
    manufacturerName: 'Test Manufacturer',
    sku: 'TEST-SKU-123',
    image: 'https://example.com/image.jpg',
    dateOfManufacture: '2024-01-01',
    hasDevice: false,
    status: InventoryStatus.IN_STOCK,
    class: InventoryClass.REGULAR,
    inventoryCategoryId: 'cat-123',
    inventorySubCategoryId: 'subcat-123',
    tenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockInventoryBatch = {
    id: 'batch-123',
    tenantId: 'tenant-123',
    costOfItem: 40.0,
    price: 50.0,
    batchNumber: 123456,
    numberOfStock: 100,
    remainingQuantity: 100,
    creatorId: 'main-user-123',
    reservedQuantity: 0,
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
  };

  const mockTenantContext = {
    getTenantId: jest.fn().mockReturnValue('tenant-123'),
    getUserId: jest.fn().mockReturnValue('user-123'),
    getStoreId: jest.fn().mockReturnValue('branch-store-123'),
  };

  beforeAll(async () => {
    prisma = mockDeep<PrismaClient>();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(TenantContext)
      .useValue(mockTenantContext)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesAndPermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for common queries
    (prisma.store.findUnique as jest.Mock).mockImplementation((args: any) => {
      const storeId = args.where.id;
      if (storeId === 'main-store-123') return Promise.resolve(mockMainStore);
      if (storeId === 'branch-store-123')
        return Promise.resolve(mockBranchStore);
      if (storeId === 'branch-store-456')
        return Promise.resolve(mockSecondBranchStore);
      return Promise.resolve(null);
    });

    (prisma.store.findMany as jest.Mock).mockResolvedValue([
      mockMainStore,
      mockBranchStore,
      mockSecondBranchStore,
    ]);

    (prisma.user.findUnique as jest.Mock).mockImplementation((args: any) => {
      const userId = args.where.id;
      if (userId === 'user-123') return Promise.resolve(mockUser);
      if (userId === 'main-user-123') return Promise.resolve(mockMainStoreUser);
      return Promise.resolve(null);
    });
  });

  describe('Store Inventory View', () => {
    describe('GET /stores/:storeId/inventory', () => {
      it('should return store inventory view with allocations', async () => {
        const mockInventoryWithBatches = {
          ...mockInventory,
          batches: [mockInventoryBatch],
          inventoryCategory: { id: 'cat-123', name: 'Category' },
          inventorySubCategory: { id: 'subcat-123', name: 'SubCategory' },
        };

        prisma.inventory.findMany.mockResolvedValue([mockInventoryWithBatches]);
        prisma.inventory.count.mockResolvedValue(1);

        const response = await request(app.getHttpServer())
          .get('/stores/branch-store-123/inventory')
          .expect(HttpStatus.OK);

        expect(response.body).toHaveProperty('inventories');
        expect(response.body.inventories).toHaveLength(1);
        expect(response.body.inventories[0]).toMatchObject({
          inventoryId: 'inventory-123',
          inventoryName: 'Test Inventory',
          batches: expect.arrayContaining([
            expect.objectContaining({
              batchId: 'batch-123',
              batchNumber: 123456,
              totalQuantity: 100,
              allocatedToStore: 0, // Branch store has no allocation initially
              availableInStore: 0,
              isOwnedByStore: false,
              ownerStoreName: 'Main Store',
            }),
          ]),
        });
      });

      it('should return 404 for non-existent store', async () => {
        prisma.store.findUnique.mockResolvedValue(null);

        const response = await request(app.getHttpServer())
          .get('/stores/non-existent-store/inventory')
          .expect(HttpStatus.NOT_FOUND);

        expect(response.body.message).toContain('Store not found');
      });
    });
  });
  describe('Transfer Request Workflow - End to End', () => {
    describe('Complete Transfer Request Flow (Create → Approve → Confirm)', () => {
      it('should complete full transfer request workflow successfully', async () => {
        // Setup: Batch allocated to main store, branch store needs inventory
        const batchWithMainStoreAllocation = {
          ...mockInventoryBatch,
          storeAllocations: {
            'main-store-123': {
              allocated: 100,
              reserved: 0,
              lastUpdated: new Date().toISOString(),
              updatedBy: 'main-user-123',
            },
          },
          transferRequests: {},
        };

        prisma.inventoryBatch.findUnique.mockResolvedValue(
          batchWithMainStoreAllocation,
        );
        prisma.inventoryBatch.update.mockResolvedValue(
          batchWithMainStoreAllocation,
        );

        // Step 1: Create transfer request
        const createRequestDto = {
          type: 'TRANSFER' as const,
          inventoryBatchId: 'batch-123',
          sourceStoreId: 'main-store-123',
          requestedQuantity: 30,
          reason: 'Branch store inventory exhausted',
        };

        const createResponse = await request(app.getHttpServer())
          .post('/stores/branch-store-123/transfer-requests')
          .send(createRequestDto)
          .expect(HttpStatus.CREATED);

        expect(createResponse.body).toHaveProperty('requestId');
        const requestId = createResponse.body.requestId;

        // Verify request was created
        expect(prisma.inventoryBatch.update).toHaveBeenCalledWith({
          where: { id: 'batch-123' },
          data: {
            transferRequests: expect.objectContaining({
              [requestId]: expect.objectContaining({
                type: 'TRANSFER',
                sourceStoreId: 'main-store-123',
                targetStoreId: 'branch-store-123',
                requestedQuantity: 30,
                status: 'PENDING',
                reason: 'Branch store inventory exhausted',
                requestedBy: 'user-123',
                requestedByName: 'John Doe',
              }),
            }),
          },
        });

        // Step 2: Approve transfer request (as main store user)
        mockTenantContext.getUserId.mockReturnValue('main-user-123');
        mockTenantContext.getStoreId.mockReturnValue('main-store-123');

        const batchWithPendingRequest = {
          ...batchWithMainStoreAllocation,
          transferRequests: {
            [requestId]: {
              type: 'TRANSFER',
              sourceStoreId: 'main-store-123',
              targetStoreId: 'branch-store-123',
              requestedQuantity: 30,
              status: 'PENDING',
              reason: 'Branch store inventory exhausted',
              requestedBy: 'user-123',
              requestedAt: new Date().toISOString(),
              requestedByName: 'John Doe',
            },
          },
        };

        prisma.inventoryBatch.findUnique.mockResolvedValue(
          batchWithPendingRequest,
        );

        const approveDto = {
          decision: 'APPROVED' as const,
          approvedQuantity: 25, // Approve less than requested
        };

        const approveResponse = await request(app.getHttpServer())
          .put(`/transfer-requests/${requestId}/approve`)
          .send(approveDto)
          .expect(HttpStatus.OK);

        expect(approveResponse.body.message).toContain('approved');

        // Verify approval was recorded
        expect(prisma.inventoryBatch.update).toHaveBeenCalledWith({
          where: { id: 'batch-123' },
          data: {
            transferRequests: expect.objectContaining({
              [requestId]: expect.objectContaining({
                status: 'APPROVED',
                approvedQuantity: 25,
                approvedBy: 'main-user-123',
                approvedByName: 'Main User',
              }),
            }),
          },
        });

        // Step 3: Confirm transfer request (as requesting store user)
        mockTenantContext.getUserId.mockReturnValue('user-123');
        mockTenantContext.getStoreId.mockReturnValue('branch-store-123');

        const batchWithApprovedRequest = {
          ...batchWithMainStoreAllocation,
          transferRequests: {
            [requestId]: {
              type: 'TRANSFER',
              sourceStoreId: 'main-store-123',
              targetStoreId: 'branch-store-123',
              requestedQuantity: 30,
              approvedQuantity: 25,
              status: 'APPROVED',
              reason: 'Branch store inventory exhausted',
              requestedBy: 'user-123',
              requestedAt: new Date().toISOString(),
              requestedByName: 'John Doe',
              approvedBy: 'main-user-123',
              approvedAt: new Date().toISOString(),
              approvedByName: 'Main User',
            },
          },
        };

        prisma.inventoryBatch.findUnique.mockResolvedValue(
          batchWithApprovedRequest,
        );

        const confirmResponse = await request(app.getHttpServer())
          .put(`/transfer-requests/${requestId}/confirm`)
          .expect(HttpStatus.OK);

        expect(confirmResponse.body.message).toContain('confirmed');

        // Verify final allocation update
        expect(prisma.inventoryBatch.update).toHaveBeenCalledWith({
          where: { id: 'batch-123' },
          data: {
            storeAllocations: {
              'main-store-123': {
                allocated: 75, // Reduced by 25
                reserved: 0,
                lastUpdated: expect.any(String),
                updatedBy: 'user-123',
              },
              'branch-store-123': {
                allocated: 25, // Increased by 25
                reserved: 0,
                lastUpdated: expect.any(String),
                updatedBy: 'user-123',
              },
            },
            transferRequests: expect.objectContaining({
              [requestId]: expect.objectContaining({
                status: 'COMPLETED',
                confirmedBy: 'user-123',
                confirmedByName: 'John Doe',
              }),
            }),
          },
        });
      });

      it('should handle transfer request rejection workflow', async () => {
        const batchWithMainStoreAllocation = {
          ...mockInventoryBatch,
          storeAllocations: {
            'main-store-123': {
              allocated: 100,
              reserved: 0,
              lastUpdated: new Date().toISOString(),
              updatedBy: 'main-user-123',
            },
          },
          transferRequests: {},
        };

        prisma.inventoryBatch.findUnique.mockResolvedValue(
          batchWithMainStoreAllocation,
        );
        prisma.inventoryBatch.update.mockResolvedValue(
          batchWithMainStoreAllocation,
        );

        // Create transfer request
        const createRequestDto = {
          type: 'TRANSFER' as const,
          inventoryBatchId: 'batch-123',
          sourceStoreId: 'main-store-123',
          requestedQuantity: 50,
          reason: 'Need more inventory',
        };

        const createResponse = await request(app.getHttpServer())
          .post('/stores/branch-store-123/transfer-requests')
          .send(createRequestDto)
          .expect(HttpStatus.CREATED);

        const requestId = createResponse.body.requestId;

        // Reject the request
        mockTenantContext.getUserId.mockReturnValue('main-user-123');
        mockTenantContext.getStoreId.mockReturnValue('main-store-123');

        const batchWithPendingRequest = {
          ...batchWithMainStoreAllocation,
          transferRequests: {
            [requestId]: {
              type: 'TRANSFER',
              sourceStoreId: 'main-store-123',
              targetStoreId: 'branch-store-123',
              requestedQuantity: 50,
              status: 'PENDING',
              reason: 'Need more inventory',
              requestedBy: 'user-123',
              requestedAt: new Date().toISOString(),
              requestedByName: 'John Doe',
            },
          },
        };

        prisma.inventoryBatch.findUnique.mockResolvedValue(
          batchWithPendingRequest,
        );

        const rejectDto = {
          decision: 'REJECTED' as const,
          rejectionReason: 'Insufficient inventory available',
        };

        const rejectResponse = await request(app.getHttpServer())
          .put(`/transfer-requests/${requestId}/approve`)
          .send(rejectDto)
          .expect(HttpStatus.OK);

        expect(rejectResponse.body.message).toContain('rejected');

        // Verify rejection was recorded
        expect(prisma.inventoryBatch.update).toHaveBeenCalledWith({
          where: { id: 'batch-123' },
          data: {
            transferRequests: expect.objectContaining({
              [requestId]: expect.objectContaining({
                status: 'REJECTED',
                rejectionReason: 'Insufficient inventory available',
                approvedBy: 'main-user-123',
                approvedByName: 'Main User',
              }),
            }),
          },
        });
      });
    });
  });

  describe('Multi-Store Allocation Scenarios', () => {
    it('should handle complex multi-store allocation transfers', async () => {
      // Setup: Batch with allocations across multiple stores
      const complexBatch = {
        ...mockInventoryBatch,
        numberOfStock: 200,
        remainingQuantity: 200,
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
            updatedBy: 'user-123',
          },
          'branch-store-456': {
            allocated: 50,
            reserved: 0,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'user-456',
          },
        },
        transferRequests: {},
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(complexBatch);
      prisma.inventoryBatch.update.mockResolvedValue(complexBatch);

      // Test store inventory view for each store
      const mockInventoryWithComplexBatch = {
        ...mockInventory,
        batches: [complexBatch],
        inventoryCategory: { id: 'cat-123', name: 'Category' },
        inventorySubCategory: { id: 'subcat-123', name: 'SubCategory' },
      };

      prisma.inventory.findMany.mockResolvedValue([
        mockInventoryWithComplexBatch,
      ]);
      prisma.inventory.count.mockResolvedValue(1);

      // Check main store view
      const mainStoreResponse = await request(app.getHttpServer())
        .get('/stores/main-store-123/inventory')
        .expect(HttpStatus.OK);

      expect(mainStoreResponse.body.inventories[0].batches[0]).toMatchObject({
        allocatedToStore: 100,
        reservedInStore: 10,
        availableInStore: 90,
        isOwnedByStore: true,
        ownerStoreName: 'Main Store',
      });

      // Check branch store view
      const branchStoreResponse = await request(app.getHttpServer())
        .get('/stores/branch-store-123/inventory')
        .expect(HttpStatus.OK);

      expect(branchStoreResponse.body.inventories[0].batches[0]).toMatchObject({
        allocatedToStore: 50,
        reservedInStore: 5,
        availableInStore: 45,
        isOwnedByStore: false, // Not the main owner
        ownerStoreName: 'Main Store',
      });

      // Test transfer between branch stores
      mockTenantContext.getUserId.mockReturnValue('user-456');
      mockTenantContext.getStoreId.mockReturnValue('branch-store-456');

      const transferBetweenBranches = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'branch-store-123',
        requestedQuantity: 20,
        reason: 'Redistribution between branches',
      };

      const transferResponse = await request(app.getHttpServer())
        .post('/stores/branch-store-456/transfer-requests')
        .send(transferBetweenBranches)
        .expect(HttpStatus.CREATED);

      expect(transferResponse.body).toHaveProperty('requestId');
    });

    it('should prevent allocation beyond available quantity', async () => {
      const limitedBatch = {
        ...mockInventoryBatch,
        numberOfStock: 50,
        remainingQuantity: 50,
        storeAllocations: {
          'main-store-123': {
            allocated: 50,
            reserved: 0,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'main-user-123',
          },
        },
        transferRequests: {},
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(limitedBatch);

      const excessiveRequestDto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'main-store-123',
        requestedQuantity: 60, // More than available
        reason: 'Excessive request',
      };

      const response = await request(app.getHttpServer())
        .post('/stores/branch-store-123/transfer-requests')
        .send(excessiveRequestDto)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.message).toContain(
        'Insufficient inventory allocation',
      );
    });
  });

  describe('Permission Validation Across Stores', () => {
    it('should prevent users from accessing unauthorized stores', async () => {
      // User from branch-store-123 trying to access branch-store-456
      mockTenantContext.getStoreId.mockReturnValue('branch-store-123');

      const response = await request(app.getHttpServer())
        .get('/stores/branch-store-456/inventory')
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.message).toContain('Access denied');
    });

    it('should prevent users from creating requests for other stores', async () => {
      // User from branch-store-123 trying to create request for branch-store-456
      mockTenantContext.getStoreId.mockReturnValue('branch-store-123');

      const unauthorizedRequestDto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'main-store-123',
        requestedQuantity: 20,
        reason: 'Unauthorized request',
      };

      const response = await request(app.getHttpServer())
        .post('/stores/branch-store-456/transfer-requests')
        .send(unauthorizedRequestDto)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.message).toContain('Access denied');
    });

    it('should prevent users from approving requests for unauthorized stores', async () => {
      const batchWithRequest = {
        ...mockInventoryBatch,
        transferRequests: {
          'request-123': {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-456',
            requestedQuantity: 30,
            status: 'PENDING',
            requestedBy: 'user-456',
            requestedAt: new Date().toISOString(),
            requestedByName: 'User 456',
          },
        },
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(batchWithRequest);

      // Branch store user trying to approve request for main store
      mockTenantContext.getUserId.mockReturnValue('user-123');
      mockTenantContext.getStoreId.mockReturnValue('branch-store-123');

      const approveDto = {
        decision: 'APPROVED' as const,
        approvedQuantity: 30,
      };

      const response = await request(app.getHttpServer())
        .put('/transfer-requests/request-123/approve')
        .send(approveDto)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.message).toContain('Access denied');
    });

    it('should allow main store users to approve requests from any store', async () => {
      const batchWithRequest = {
        ...mockInventoryBatch,
        transferRequests: {
          'request-123': {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-456',
            requestedQuantity: 30,
            status: 'PENDING',
            requestedBy: 'user-456',
            requestedAt: new Date().toISOString(),
            requestedByName: 'User 456',
          },
        },
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(batchWithRequest);
      prisma.inventoryBatch.update.mockResolvedValue(batchWithRequest);

      // Main store user approving request
      mockTenantContext.getUserId.mockReturnValue('main-user-123');
      mockTenantContext.getStoreId.mockReturnValue('main-store-123');

      const approveDto = {
        decision: 'APPROVED' as const,
        approvedQuantity: 30,
      };

      const response = await request(app.getHttpServer())
        .put('/transfer-requests/request-123/approve')
        .send(approveDto)
        .expect(HttpStatus.OK);

      expect(response.body.message).toContain('approved');
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent transfer requests properly', async () => {
      const batchWithLimitedStock = {
        ...mockInventoryBatch,
        numberOfStock: 100,
        remainingQuantity: 100,
        storeAllocations: {
          'main-store-123': {
            allocated: 100,
            reserved: 0,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'main-user-123',
          },
        },
        transferRequests: {},
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(batchWithLimitedStock);
      prisma.inventoryBatch.update.mockResolvedValue(batchWithLimitedStock);

      // Simulate concurrent requests from different stores
      const request1Dto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'main-store-123',
        requestedQuantity: 60,
        reason: 'First concurrent request',
      };

      const request2Dto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'main-store-123',
        requestedQuantity: 60,
        reason: 'Second concurrent request',
      };

      // First request should succeed
      mockTenantContext.getStoreId.mockReturnValue('branch-store-123');
      const response1 = await request(app.getHttpServer())
        .post('/stores/branch-store-123/transfer-requests')
        .send(request1Dto)
        .expect(HttpStatus.CREATED);

      expect(response1.body).toHaveProperty('requestId');

      // Second request from different store should also succeed (requests don't reserve inventory)
      mockTenantContext.getStoreId.mockReturnValue('branch-store-456');
      const response2 = await request(app.getHttpServer())
        .post('/stores/branch-store-456/transfer-requests')
        .send(request2Dto)
        .expect(HttpStatus.CREATED);

      expect(response2.body).toHaveProperty('requestId');
      expect(response2.body.requestId).not.toBe(response1.body.requestId);
    });

    it('should prevent duplicate requests from same store for same batch', async () => {
      const batchWithExistingRequest = {
        ...mockInventoryBatch,
        transferRequests: {
          'existing-request': {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-123',
            requestedQuantity: 30,
            status: 'PENDING',
            requestedBy: 'user-123',
            requestedAt: new Date().toISOString(),
            requestedByName: 'John Doe',
          },
        },
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(
        batchWithExistingRequest,
      );

      const duplicateRequestDto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'main-store-123',
        requestedQuantity: 20,
        reason: 'Duplicate request',
      };

      const response = await request(app.getHttpServer())
        .post('/stores/branch-store-123/transfer-requests')
        .send(duplicateRequestDto)
        .expect(HttpStatus.CONFLICT);

      expect(response.body.message).toContain('already has a pending request');
    });

    it('should handle concurrent approval and confirmation operations', async () => {
      const requestId = 'concurrent-request-123';
      const batchWithApprovedRequest = {
        ...mockInventoryBatch,
        transferRequests: {
          [requestId]: {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-123',
            requestedQuantity: 30,
            approvedQuantity: 25,
            status: 'APPROVED',
            requestedBy: 'user-123',
            requestedAt: new Date().toISOString(),
            requestedByName: 'John Doe',
            approvedBy: 'main-user-123',
            approvedAt: new Date().toISOString(),
            approvedByName: 'Main User',
          },
        },
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(
        batchWithApprovedRequest,
      );
      prisma.inventoryBatch.update.mockResolvedValue(batchWithApprovedRequest);

      // Confirm the request
      mockTenantContext.getUserId.mockReturnValue('user-123');
      mockTenantContext.getStoreId.mockReturnValue('branch-store-123');

      const confirmResponse = await request(app.getHttpServer())
        .put(`/transfer-requests/${requestId}/confirm`)
        .expect(HttpStatus.OK);

      expect(confirmResponse.body.message).toContain('confirmed');

      // Try to confirm again (should fail)
      const batchWithCompletedRequest = {
        ...batchWithApprovedRequest,
        transferRequests: {
          [requestId]: {
            ...batchWithApprovedRequest.transferRequests[requestId],
            status: 'COMPLETED',
            confirmedBy: 'user-123',
            confirmedAt: new Date().toISOString(),
            confirmedByName: 'John Doe',
          },
        },
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(
        batchWithCompletedRequest,
      );

      const duplicateConfirmResponse = await request(app.getHttpServer())
        .put(`/transfer-requests/${requestId}/confirm`)
        .expect(HttpStatus.BAD_REQUEST);

      expect(duplicateConfirmResponse.body.message).toContain(
        'Invalid transfer request state',
      );
    });
  });

  describe('Migration Integration with Existing Data', () => {
    it('should work with migrated inventory batches', async () => {
      // Simulate a batch that was migrated (allocated to main store)
      const migratedBatch = {
        ...mockInventoryBatch,
        storeAllocations: {
          'main-store-123': {
            allocated: 100,
            reserved: 0,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'SYSTEM_MIGRATION',
          },
        },
        transferRequests: {},
      };

      const migratedInventory = {
        ...mockInventory,
        batches: [migratedBatch],
        inventoryCategory: { id: 'cat-123', name: 'Category' },
        inventorySubCategory: { id: 'subcat-123', name: 'SubCategory' },
      };

      prisma.inventory.findMany.mockResolvedValue([migratedInventory]);
      prisma.inventory.count.mockResolvedValue(1);

      // Test that migrated data works with store inventory view
      const response = await request(app.getHttpServer())
        .get('/stores/main-store-123/inventory')
        .expect(HttpStatus.OK);

      expect(response.body.inventories[0].batches[0]).toMatchObject({
        allocatedToStore: 100,
        availableInStore: 100,
        isOwnedByStore: true,
        ownerStoreName: 'Main Store',
      });

      // Test that branch stores can see migrated inventory
      const branchResponse = await request(app.getHttpServer())
        .get('/stores/branch-store-123/inventory')
        .expect(HttpStatus.OK);

      expect(branchResponse.body.inventories[0].batches[0]).toMatchObject({
        allocatedToStore: 0,
        availableInStore: 0,
        isOwnedByStore: false,
        ownerStoreName: 'Main Store',
      });
    });

    it('should handle batches without store allocations gracefully', async () => {
      // Simulate a batch that hasn't been migrated yet
      const unmigratedBatch = {
        ...mockInventoryBatch,
        storeAllocations: null, // No allocations yet
        transferRequests: null,
      };

      const unmigratedInventory = {
        ...mockInventory,
        batches: [unmigratedBatch],
        inventoryCategory: { id: 'cat-123', name: 'Category' },
        inventorySubCategory: { id: 'subcat-123', name: 'SubCategory' },
      };

      prisma.inventory.findMany.mockResolvedValue([unmigratedInventory]);
      prisma.inventory.count.mockResolvedValue(1);

      // Should handle gracefully and show zero allocations
      const response = await request(app.getHttpServer())
        .get('/stores/main-store-123/inventory')
        .expect(HttpStatus.OK);

      expect(response.body.inventories[0].batches[0]).toMatchObject({
        allocatedToStore: 0,
        availableInStore: 0,
        isOwnedByStore: false,
        ownerStoreName: 'Unknown',
      });
    });

    it('should validate migration data integrity', async () => {
      // Test with various migration scenarios
      const complexMigratedBatch = {
        ...mockInventoryBatch,
        numberOfStock: 150,
        remainingQuantity: 150,
        storeAllocations: {
          'main-store-123': {
            allocated: 150,
            reserved: 0,
            lastUpdated: new Date().toISOString(),
            updatedBy: 'SYSTEM_MIGRATION',
          },
        },
        transferRequests: {},
      };

      prisma.inventoryBatch.findUnique.mockResolvedValue(complexMigratedBatch);
      prisma.inventoryBatch.update.mockResolvedValue(complexMigratedBatch);

      // Test that we can create transfer requests on migrated data
      const transferRequestDto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'main-store-123',
        requestedQuantity: 50,
        reason: 'Testing migrated data',
      };

      const response = await request(app.getHttpServer())
        .post('/stores/branch-store-123/transfer-requests')
        .send(transferRequestDto)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('requestId');

      // Verify the total allocated quantity matches the original stock
      const mockInventoryWithMigratedBatch = {
        ...mockInventory,
        batches: [complexMigratedBatch],
        inventoryCategory: { id: 'cat-123', name: 'Category' },
        inventorySubCategory: { id: 'subcat-123', name: 'SubCategory' },
      };

      prisma.inventory.findMany.mockResolvedValue([
        mockInventoryWithMigratedBatch,
      ]);
      prisma.inventory.count.mockResolvedValue(1);

      const inventoryResponse = await request(app.getHttpServer())
        .get('/stores/main-store-123/inventory')
        .expect(HttpStatus.OK);

      expect(inventoryResponse.body.inventories[0]).toMatchObject({
        totalAllocated: 150,
        totalAvailable: 150,
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid batch IDs gracefully', async () => {
      prisma.inventoryBatch.findUnique.mockResolvedValue(null);

      const invalidRequestDto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'non-existent-batch',
        sourceStoreId: 'main-store-123',
        requestedQuantity: 30,
        reason: 'Invalid batch test',
      };

      const response = await request(app.getHttpServer())
        .post('/stores/branch-store-123/transfer-requests')
        .send(invalidRequestDto)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.message).toContain('Inventory batch not found');
    });

    it('should handle invalid transfer request IDs', async () => {
      const response = await request(app.getHttpServer())
        .put('/transfer-requests/non-existent-request/approve')
        .send({ decision: 'APPROVED', approvedQuantity: 10 })
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.message).toContain('Transfer request not found');
    });

    it('should validate request quantities', async () => {
      prisma.inventoryBatch.findUnique.mockResolvedValue(mockInventoryBatch);

      const invalidQuantityDto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        sourceStoreId: 'main-store-123',
        requestedQuantity: -5, // Negative quantity
        reason: 'Invalid quantity test',
      };

      const response = await request(app.getHttpServer())
        .post('/stores/branch-store-123/transfer-requests')
        .send(invalidQuantityDto)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.message).toContain(
        'requestedQuantity must not be less than 1',
      );
    });

    it('should handle missing required fields', async () => {
      const incompleteDto = {
        type: 'TRANSFER' as const,
        inventoryBatchId: 'batch-123',
        // Missing sourceStoreId and requestedQuantity
        reason: 'Incomplete request test',
      };

      const response = await request(app.getHttpServer())
        .post('/stores/branch-store-123/transfer-requests')
        .send(incompleteDto)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.message).toContain('requestedQuantity');
    });
  });

  describe('Pending Requests Management', () => {
    it('should retrieve pending requests for a store', async () => {
      const batchWithMultipleRequests = {
        ...mockInventoryBatch,
        transferRequests: {
          'request-1': {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-123',
            requestedQuantity: 30,
            status: 'PENDING',
            requestedBy: 'user-123',
            requestedAt: new Date().toISOString(),
            requestedByName: 'John Doe',
            reason: 'First request',
          },
          'request-2': {
            type: 'TRANSFER',
            sourceStoreId: 'branch-store-456',
            targetStoreId: 'branch-store-123',
            requestedQuantity: 20,
            status: 'APPROVED',
            requestedBy: 'user-123',
            requestedAt: new Date().toISOString(),
            requestedByName: 'John Doe',
            approvedBy: 'user-456',
            approvedAt: new Date().toISOString(),
            approvedByName: 'User 456',
            approvedQuantity: 15,
            reason: 'Second request',
          },
          'request-3': {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-456',
            requestedQuantity: 25,
            status: 'COMPLETED',
            requestedBy: 'user-456',
            requestedAt: new Date().toISOString(),
            requestedByName: 'User 456',
            reason: 'Completed request',
          },
        },
      };

      prisma.inventoryBatch.findMany.mockResolvedValue([
        batchWithMultipleRequests,
      ]);

      // Get pending requests for branch-store-123
      const response = await request(app.getHttpServer())
        .get('/stores/branch-store-123/pending-requests')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('requests');
      expect(response.body.requests).toHaveLength(2); // One pending, one approved

      const pendingRequest = response.body.requests.find(
        (r: any) => r.status === 'PENDING',
      );
      const approvedRequest = response.body.requests.find(
        (r: any) => r.status === 'APPROVED',
      );

      expect(pendingRequest).toMatchObject({
        requestId: 'request-1',
        status: 'PENDING',
        requestedQuantity: 30,
        reason: 'First request',
      });

      expect(approvedRequest).toMatchObject({
        requestId: 'request-2',
        status: 'APPROVED',
        requestedQuantity: 20,
        approvedQuantity: 15,
        reason: 'Second request',
      });
    });

    it('should filter pending requests by status', async () => {
      const batchWithRequests = {
        ...mockInventoryBatch,
        transferRequests: {
          'pending-request': {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-123',
            requestedQuantity: 30,
            status: 'PENDING',
            requestedBy: 'user-123',
            requestedAt: new Date().toISOString(),
            requestedByName: 'John Doe',
          },
          'approved-request': {
            type: 'TRANSFER',
            sourceStoreId: 'main-store-123',
            targetStoreId: 'branch-store-123',
            requestedQuantity: 20,
            status: 'APPROVED',
            requestedBy: 'user-123',
            requestedAt: new Date().toISOString(),
            requestedByName: 'John Doe',
            approvedQuantity: 20,
          },
        },
      };

      prisma.inventoryBatch.findMany.mockResolvedValue([batchWithRequests]);

      // Filter for only pending requests
      const pendingResponse = await request(app.getHttpServer())
        .get('/stores/branch-store-123/pending-requests?status=PENDING')
        .expect(HttpStatus.OK);

      expect(pendingResponse.body.requests).toHaveLength(1);
      expect(pendingResponse.body.requests[0].status).toBe('PENDING');

      // Filter for only approved requests
      const approvedResponse = await request(app.getHttpServer())
        .get('/stores/branch-store-123/pending-requests?status=APPROVED')
        .expect(HttpStatus.OK);

      expect(approvedResponse.body.requests).toHaveLength(1);
      expect(approvedResponse.body.requests[0].status).toBe('APPROVED');
    });
  });
});
