import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CategoryTypes,
  InventoryClass,
  InventoryStatus,
  PrismaClient,
} from '@prisma/client';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { MESSAGES } from '../constants';
import { FetchInventoryQueryDto } from './dto/fetch-inventory.dto';
import {
  mockInventoryBatchResponse,
  mockInventoryResponse,
} from '../../test/mockData/inventory';
import { TenantContext } from '../tenants/context/tenant.context';
import { StorageService } from '../../config/storage.provider';
import { StoreService } from '../store/store.service';

describe('InventoryService', () => {
  let service: InventoryService;

  let mockPrismaService: DeepMockProxy<PrismaClient>;

  const mockCloudinaryService = {
    uploadFile: jest.fn().mockResolvedValue({
      secure_url: 'http://example.com/image.png',
    }),
  };

  const mockTenantContext = {
    requireTenantId: jest.fn().mockReturnValue('tenant123'),
  };

  const mockStorageService = {
    uploadFile: jest.fn().mockResolvedValue({
      secure_url: 'http://example.com/image.png',
      url: 'http://example.com/image.png',
    }),
  };

  const mockStoreService = {
    findMainStore: jest.fn().mockResolvedValue({
      id: 'main-store-123',
      name: 'Main Store',
      classification: 'MAIN',
    }),
    findOne: jest.fn().mockResolvedValue({
      id: 'store-123',
      name: 'Test Store',
      classification: 'BRANCH',
    }),
    findAllByTenant: jest.fn().mockResolvedValue([
      {
        id: 'main-store-123',
        name: 'Main Store',
        classification: 'MAIN',
      },
      {
        id: 'store-123',
        name: 'Test Store',
        classification: 'BRANCH',
      },
    ]),
  };

  const mockFile = {
    originalname: 'test.png',
    buffer: Buffer.from(''),
    mimetype: 'image/png',
  } as Express.Multer.File;

  const createInventoryDto: CreateInventoryDto = {
    name: 'Test Inventory',
    manufacturerName: 'Test Manufacturer',
    inventoryCategoryId: 'cat123',
    inventorySubCategoryId: 'subcat123',
    numberOfStock: 100,
    price: '100',
    class: InventoryClass.REGULAR,
    inventoryImage: mockFile,
  };

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CloudinaryService, useValue: mockCloudinaryService },
        { provide: TenantContext, useValue: mockTenantContext },
        { provide: StorageService, useValue: mockStorageService },
        { provide: StoreService, useValue: mockStoreService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInventory', () => {
    it('should create an inventory item successfully', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue({
        id: 'cat123',
        name: 'Test Category',
        parentId: 'parentCat123',
        type: CategoryTypes.INVENTORY,
        tenantId: 'tenant123',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrismaService.inventory.findFirst.mockResolvedValue(null);

      mockPrismaService.inventory.create.mockResolvedValue({
        id: 'inv123',
        name: 'Test Item',
        createdAt: new Date(),
        updatedAt: new Date(),
        manufacturerName: 'Test Manufacturer',
        inventoryCategoryId: 'cat123',
        inventorySubCategoryId: 'subcat123',
        class: InventoryClass.REGULAR,
        tenantId: 'tenant123',
        image: 'http://example.com/image.png',
        sku: 'SKU123',
        dateOfManufacture: new Date(),
        hasDevice: false,
        status: InventoryStatus.ACTIVE,
        deletedAt: null,
      });

      mockPrismaService.inventoryBatch.create.mockResolvedValue({
        id: 'batch123',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        batchNumber: 123456,
        costOfItem: 50,
        price: 100,
        numberOfStock: 100,
        inventoryId: 'inv123',
        remainingQuantity: 100,
        reservedQuantity: 0,
        tenantId: 'tenant123',
        creatorId: 'user123',
        storeAllocations: {},
        transferRequests: {},
      });

      const result = await service.createInventory(
        'user123',
        createInventoryDto,
        mockFile,
      );

      const mockResult = {
        message: MESSAGES.INVENTORY_CREATED,
      };

      expect(result).toEqual(mockResult);
      expect(mockCloudinaryService.uploadFile).toHaveBeenCalled();
      expect(mockPrismaService.inventory.create).toHaveBeenCalled();
      expect(mockPrismaService.inventoryBatch.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when category is invalid', async () => {
      mockPrismaService.category.findFirst.mockResolvedValue(null);

      await expect(
        service.createInventory(
          'user123',
          createInventoryDto,
          {} as Express.Multer.File,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Get Inventories', () => {
    it('should return paginated users', async () => {
      mockPrismaService.inventory.findMany.mockResolvedValueOnce(
        mockInventoryResponse,
      );
      mockPrismaService.inventory.count.mockResolvedValueOnce(1);

      const paginatedInventory = {
        inventories: mockInventoryResponse,
        total: 1,
        page: '1',
        limit: '10',
        totalPages: 1,
      };

      const query: FetchInventoryQueryDto = { page: '1', limit: '10' };

      const result = await service.getInventories(query);
      expect(result).toEqual(paginatedInventory);
      expect(mockPrismaService.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  describe('Fetch Inventory Batch Details', () => {
    it('should return an Inventory Batch Details', async () => {
      mockPrismaService.inventoryBatch.findUnique.mockResolvedValue(
        mockInventoryBatchResponse,
      );

      const result = await service.getInventory(mockInventoryBatchResponse.id);

      expect(result).toHaveProperty('id');
      expect(mockPrismaService.inventoryBatch.findUnique).toHaveBeenCalled();
    });

    it('should throw NotFoundException if Inventory Batch Details does not exist', async () => {
      mockPrismaService.inventoryBatch.findUnique.mockResolvedValue(null);

      await expect(service.getInventory('nonexistent-id')).rejects.toThrow(
        new NotFoundException(MESSAGES.BATCH_NOT_FOUND),
      );
    });
  });

  describe('createInventoryCategory', () => {
    it('should create a new category when no conflicts exist', async () => {
      mockPrismaService.category.findUnique.mockResolvedValueOnce(null);

      mockPrismaService.category.findFirst.mockResolvedValueOnce({
        id: 'cat123',
        parentId: null,
        type: CategoryTypes.INVENTORY,
        name: 'Electronics',
        tenantId: 'tenant123',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrismaService.category.create.mockResolvedValueOnce({
        id: 'cat123',
        parentId: null,
        type: CategoryTypes.INVENTORY,
        name: 'Electronics',
        tenantId: 'tenant123',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const categories = [
        {
          name: 'Electronics',
          parentId: 'valid-parent-id',
          subCategories: [{ name: 'Battery Charger' }],
        },
      ];

      const result = await service.createInventoryCategory(categories);

      expect(result.message).toBe(MESSAGES.CREATED);
      expect(mockPrismaService.category.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if parentId is invalid', async () => {
      mockPrismaService.category.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.category.findFirst.mockRejectedValue(null);
      const categories = [
        {
          name: 'Invalid Category',
          parentId: 'nonexistent-id',
          subCategories: [],
        },
      ];

      await expect(service.createInventoryCategory(categories)).rejects.toThrow(
        new BadRequestException('Invalid Parent Id'),
      );
    });
  });

  describe('Fetch Inventory Tabs', () => {
    it('should return an Inventory Batch Tabs if ID valid', async () => {
      mockPrismaService.inventoryBatch.findUnique.mockResolvedValue(
        mockInventoryBatchResponse,
      );

      const result = await service.getInventoryTabs(
        mockInventoryBatchResponse.id,
      );

      expect(result.length).toBeGreaterThan(1);
      expect(mockPrismaService.inventoryBatch.findUnique).toHaveBeenCalled();
    });

    it('should throw NotFoundException if Inventory Batch ID is not found', async () => {
      mockPrismaService.inventoryBatch.findUnique.mockResolvedValue(null);

      await expect(service.getInventoryTabs('nonexistent-id')).rejects.toThrow(
        new NotFoundException(MESSAGES.BATCH_NOT_FOUND),
      );
    });
  });

  describe('Store Context Integration', () => {
    describe('createInventoryBatch', () => {
      it('should auto-allocate new batch to main store', async () => {
        const createBatchDto = {
          inventoryId: 'inv123',
          numberOfStock: 100,
          costOfItem: '50',
          price: '100',
        };

        mockPrismaService.inventory.findFirst.mockResolvedValue({
          id: 'inv123',
          name: 'Test Inventory',
          tenantId: 'tenant123',
          createdAt: new Date(),
          updatedAt: new Date(),
          manufacturerName: 'Test Manufacturer',
          inventoryCategoryId: 'cat123',
          inventorySubCategoryId: 'subcat123',
          class: InventoryClass.REGULAR,
          image: 'http://example.com/image.png',
          sku: 'SKU123',
          dateOfManufacture: new Date(),
          hasDevice: false,
          status: InventoryStatus.IN_STOCK,
          deletedAt: null,
        });

        mockPrismaService.inventoryBatch.create.mockResolvedValue({
          id: 'batch123',
          inventoryId: 'inv123',
          batchNumber: 123456,
          numberOfStock: 100,
          remainingQuantity: 100,
          reservedQuantity: 0,
          costOfItem: 50,
          price: 100,
          tenantId: 'tenant123',
          storeAllocations: {
            'main-store-123': {
              allocated: 100,
              reserved: 0,
              lastUpdated: new Date().toISOString(),
              updatedBy: 'user123',
            },
          },
          transferRequests: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          creatorId: 'user123',
        });

        const result = await service.createInventoryBatch(
          'user123',
          createBatchDto,
        );

        expect(result.message).toBe(MESSAGES.INVENTORY_CREATED);
        expect(mockStoreService.findMainStore).toHaveBeenCalled();
        expect(mockPrismaService.inventoryBatch.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              storeAllocations: expect.objectContaining({
                'main-store-123': expect.objectContaining({
                  allocated: 100,
                  reserved: 0,
                  updatedBy: 'user123',
                }),
              }),
            }),
          }),
        );
      });
    });

    describe('getInventoriesWithStoreContext', () => {
      it('should return inventories with store allocation data', async () => {
        const mockInventoryWithAllocations = [
          {
            id: 'inv123',
            name: 'Test Inventory',
            tenantId: 'tenant123',
            batches: [
              {
                id: 'batch123',
                batchNumber: 123456,
                numberOfStock: 100,
                remainingQuantity: 80,
                price: 100,
                storeAllocations: {
                  'main-store-123': {
                    allocated: 60,
                    reserved: 10,
                    lastUpdated: new Date().toISOString(),
                    updatedBy: 'user123',
                  },
                  'store-123': {
                    allocated: 20,
                    reserved: 5,
                    lastUpdated: new Date().toISOString(),
                    updatedBy: 'user123',
                  },
                },
                creatorDetails: {
                  firstname: 'John',
                  lastname: 'Doe',
                },
              },
            ],
            inventoryCategory: { id: 'cat123', name: 'Category' },
            inventorySubCategory: { id: 'subcat123', name: 'SubCategory' },
            createdAt: new Date(),
            updatedAt: new Date(),
            manufacturerName: 'Test Manufacturer',
            inventoryCategoryId: 'cat123',
            inventorySubCategoryId: 'subcat123',
            deletedAt: null,
          },
        ];

        mockPrismaService.inventory.findMany.mockResolvedValue(
          mockInventoryWithAllocations,
        );
        mockPrismaService.inventory.count.mockResolvedValue(1);

        const query: FetchInventoryQueryDto = { page: '1', limit: '10' };
        const result = await service.getInventoriesWithStoreContext(
          query,
          'store-123',
        );

        expect(result.inventories).toBeDefined();
        expect(result.inventories[0].batches[0]).toHaveProperty(
          'storeAllocation',
        );
        expect(result.inventories[0].batches[0].storeAllocation).toEqual({
          allocatedToStore: 20,
          reservedInStore: 5,
          availableInStore: 15,
          isOwnedByStore: false,
          ownerStoreName: 'Main Store',
          totalAllocated: 80,
        });
        expect(mockStoreService.findOne).toHaveBeenCalledWith('store-123');
        expect(mockStoreService.findAllByTenant).toHaveBeenCalled();
      });

      it('should return regular inventory data when no storeId provided', async () => {
        mockPrismaService.inventory.findMany.mockResolvedValue(
          mockInventoryResponse,
        );
        mockPrismaService.inventory.count.mockResolvedValue(1);

        const query: FetchInventoryQueryDto = { page: '1', limit: '10' };
        const result = await service.getInventoriesWithStoreContext(query);

        expect(result.inventories).toBeDefined();
        expect(mockStoreService.findOne).not.toHaveBeenCalled();
      });
    });

    describe('getInventory with store context', () => {
      it('should return inventory with store allocation data when storeId provided', async () => {
        const mockInventoryWithBatches = {
          id: 'inv123',
          name: 'Test Inventory',
          tenantId: 'tenant123',
          batches: [
            {
              id: 'batch123',
              batchNumber: 123456,
              numberOfStock: 100,
              remainingQuantity: 80,
              price: 100,
              storeAllocations: {
                'store-123': {
                  allocated: 30,
                  reserved: 5,
                  lastUpdated: new Date().toISOString(),
                  updatedBy: 'user123',
                },
              },
              creatorDetails: {
                firstname: 'John',
                lastname: 'Doe',
              },
            },
          ],
          inventoryCategory: { id: 'cat123', name: 'Category' },
          inventorySubCategory: { id: 'subcat123', name: 'SubCategory' },
          createdAt: new Date(),
          updatedAt: new Date(),
          manufacturerName: 'Test Manufacturer',
          inventoryCategoryId: 'cat123',
          inventorySubCategoryId: 'subcat123',
          deletedAt: null,
        };

        mockPrismaService.inventory.findUnique.mockResolvedValue(
          mockInventoryWithBatches,
        );

        const result = await service.getInventory('inv123', 'store-123');

        expect(result.batches[0]).toHaveProperty('storeAllocation');
        expect(result.batches[0].storeAllocation).toEqual({
          allocatedToStore: 30,
          reservedInStore: 5,
          availableInStore: 25,
          totalAllocated: 30,
        });
        expect(mockStoreService.findOne).toHaveBeenCalledWith('store-123');
      });

      it('should return regular inventory data when no storeId provided', async () => {
        const mockInventoryWithBatches = {
          id: 'inv123',
          name: 'Test Inventory',
          tenantId: 'tenant123',
          batches: [
            {
              id: 'batch123',
              batchNumber: 123456,
              numberOfStock: 100,
              remainingQuantity: 80,
              price: 100,
              storeAllocations: {},
              creatorDetails: {
                firstname: 'John',
                lastname: 'Doe',
              },
            },
          ],
          inventoryCategory: { id: 'cat123', name: 'Category' },
          inventorySubCategory: { id: 'subcat123', name: 'SubCategory' },
          createdAt: new Date(),
          updatedAt: new Date(),
          manufacturerName: 'Test Manufacturer',
          inventoryCategoryId: 'cat123',
          inventorySubCategoryId: 'subcat123',
          deletedAt: null,
        };

        mockPrismaService.inventory.findUnique.mockResolvedValue(
          mockInventoryWithBatches,
        );

        const result = await service.getInventory('inv123');

        expect(result.batches[0]).not.toHaveProperty('storeAllocation');
        expect(mockStoreService.findOne).not.toHaveBeenCalled();
      });
    });
  });
});
