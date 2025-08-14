import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGES } from '../constants';
import { CategoryTypes, InventoryClass, Prisma } from '@prisma/client';
import { FetchInventoryQueryDto } from './dto/fetch-inventory.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateInventoryBatchDto } from './dto/create-inventory-batch.dto';
import { InventoryEntity } from './entity/inventory.entity';
import { plainToInstance } from 'class-transformer';
import { InventoryBatchEntity } from './entity/inventory-batch.entity';
import { CategoryEntity } from '../utils/entity/category';
import { TenantContext } from '../tenants/context/tenant.context';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { StorageService } from '../../config/storage.provider';
import { StoreContext } from 'src/store/context/store.context';

@Injectable()
export class InventoryService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storageService: StorageService,
    private readonly storeContext: StoreContext
  ) { }

  async inventoryFilter(
    query: FetchInventoryQueryDto,
  ): Promise<Prisma.InventoryWhereInput> {
    const tenantId = this.tenantContext.requireTenantId();
    const {
      search,
      inventoryCategoryId,
      inventorySubCategoryId,
      createdAt,
      updatedAt,
      class: inventoryClass,
    } = query;


    const filterConditions: Prisma.InventoryWhereInput = {
      AND: [
        { tenantId }, // ✅ Always include tenantId
        { deletedAt: null },
        search
          ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { manufacturerName: { contains: search, mode: 'insensitive' } },
            ],
          }
          : {},
        inventoryCategoryId ? { inventoryCategoryId } : {},
        inventorySubCategoryId ? { inventorySubCategoryId } : {},
        createdAt
          ? {
            createdAt: {
              gte: new Date(createdAt),
              lt: new Date(new Date(createdAt).setDate(new Date(createdAt).getDate() + 1)),
            },
          }
          : {},
        updatedAt
          ? {
            updatedAt: {
              gte: new Date(updatedAt),
              lt: new Date(new Date(updatedAt).setDate(new Date(updatedAt).getDate() + 1)),
            },
          }
          : {},
        inventoryClass ? { class: inventoryClass as InventoryClass } : {},
      ],
    };

    return filterConditions;
  }

  async uploadInventoryImage(file: Express.Multer.File) {
    // return await this.cloudinary.uploadFile(file).catch((e) => {
    //   throw e;
    // });
    const storage = await this.storageService.uploadFile(file, 'inventory');
    return await storage
  }

  async createInventory(
    requestUserId: string,
    createInventoryDto: CreateInventoryDto,
    file: Express.Multer.File,
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = this.storeContext.requireStoreId();

    const { inventorySubCategoryId, inventoryCategoryId } = createInventoryDto;

    const isCategoryValid = await this.prisma.category.findFirst({
      where: {
        id: inventoryCategoryId,
        tenantId, // ✅ Filter by tenant
        children: {
          some: {
            id: inventorySubCategoryId,
            type: CategoryTypes.INVENTORY,
          },
        },
        type: CategoryTypes.INVENTORY,
      },
    });

    if (!isCategoryValid) {
      throw new BadRequestException(
        'Invalid inventorySubCategoryId or inventoryCategoryId',
      );
    }

    const inventoryImage = (await this.uploadInventoryImage(file));
    const image = inventoryImage?.secure_url || inventoryImage?.url;

    const inventoryData = await this.prisma.inventory.create({
      data: {
        name: createInventoryDto.name,
        manufacturerName: createInventoryDto.manufacturerName,
        dateOfManufacture: createInventoryDto.dateOfManufacture,
        sku: createInventoryDto.sku,
        image,
        class: createInventoryDto.class,
        inventoryCategoryId: createInventoryDto.inventoryCategoryId,
        inventorySubCategoryId: createInventoryDto.inventorySubCategoryId,
        tenantId, // ✅ Add tenantId
        deletedAt: null,
        hasDevice: createInventoryDto.hasDevice,
      },
    });

    await this.prisma.inventoryBatch.create({
      data: {
        storeId,
        creatorId: requestUserId,
        inventoryId: inventoryData.id,
        batchNumber: Date.now() - 100,
        costOfItem: parseFloat(createInventoryDto.costOfItem),
        price: parseFloat(createInventoryDto.price),
        numberOfStock: createInventoryDto.numberOfStock,
        remainingQuantity: createInventoryDto.numberOfStock,
        tenantId, // ✅ Add tenantId to batch
      },
    });

    return {
      message: MESSAGES.INVENTORY_CREATED,
    };
  }

  async createInventoryBatch(
    requestUserId: string,
    createInventoryBatchDto: CreateInventoryBatchDto,
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = this.storeContext.requireStoreId();
    const isInventoryValid = await this.prisma.inventory.findFirst({
      where: {
        id: createInventoryBatchDto.inventoryId,
        tenantId, // ✅ Filter by tenant
      },
    });

    if (!isInventoryValid) {
      throw new BadRequestException('Invalid inventoryId');
    }

    await this.prisma.inventoryBatch.create({
      data: {
        storeId,
        creatorId: requestUserId,
        batchNumber: Date.now() - 100,
        inventoryId: createInventoryBatchDto.inventoryId,
        costOfItem: parseFloat(createInventoryBatchDto.costOfItem),
        price: parseFloat(createInventoryBatchDto.price),
        numberOfStock: createInventoryBatchDto.numberOfStock,
        remainingQuantity: createInventoryBatchDto.numberOfStock,
        tenantId, // ✅ Add tenantId to batch
      },
    });

    return {
      message: MESSAGES.INVENTORY_CREATED,
    };
  }

  async getInventories(query: FetchInventoryQueryDto) {
    const tenantId = this.tenantContext.requireTenantId();

    const {
      page = 1,
      limit = 100,
      sortField,
      sortOrder,
      inventoryCategoryId,
      inventorySubCategoryId,
    } = query;

    if (inventoryCategoryId || inventorySubCategoryId) {
      const categoryIds = [inventoryCategoryId, inventorySubCategoryId].filter(
        Boolean,
      );

      const isCategoryValid = await this.prisma.category.findFirst({
        where: {
          id: {
            in: categoryIds,
          },
          type: CategoryTypes.INVENTORY,
          tenantId, // ✅ Add tenantId filter here for category validation

        },
      });

      if (!isCategoryValid) {
        throw new BadRequestException(
          'Invalid inventorySubCategoryId or inventoryCategoryId',
        );
      }
    }

    const filterConditions = await this.inventoryFilter(query);

    // NOTE: tenantId is already included in filterConditions from the inventoryFilter method


    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const orderBy = {
      [sortField || 'createdAt']: sortOrder || 'asc',
    };

    const result = await this.prisma.inventory.findMany({
      skip,
      take,
      where: filterConditions,
      orderBy,
      include: {
        batches: {
          include: {
            creatorDetails: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        inventoryCategory: true,
        inventorySubCategory: true,
      },
    });

    const updatedResults = result.map(this.mapInventoryToResponseDto);

    const totalCount = await this.prisma.inventory.count({
      where: filterConditions,
    });

    return {
      inventories: plainToInstance(InventoryEntity, updatedResults),
      total: totalCount,
      page,
      limit,
      totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
    };
  }

  async getInventory(inventoryId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const inventory = await this.prisma.inventory.findUnique({
      where: {
        id: inventoryId,
        tenantId, // ✅ Filter by tenant
      },
      include: {
        batches: {
          include: {
            creatorDetails: {
              select: {
                firstname: true,
                lastname: true,
              },
            },
          },
        },
        inventoryCategory: true,
        inventorySubCategory: true,
      },
    });

    if (!inventory) {
      throw new NotFoundException(MESSAGES.INVENTORY_NOT_FOUND);
    }

    return this.mapInventoryToResponseDto(inventory);
  }

  async getInventoryBatch(inventoryBatchId: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const inventorybatch = await this.prisma.inventoryBatch.findUnique({
      where: {
        id: inventoryBatchId,
        tenantId, // ✅ Filter by tenant
      },
      include: {
        inventory: true,
      },
    });

    if (!inventorybatch) {
      throw new NotFoundException(MESSAGES.BATCH_NOT_FOUND);
    }

    return plainToInstance(InventoryBatchEntity, {
      ...inventorybatch,
      inventory: plainToInstance(InventoryEntity, inventorybatch.inventory),
    });
  }

  async createInventoryCategory(categories: CreateCategoryDto[]) {
    // const existingCategoryNames = [];
    const tenantId = this.tenantContext.requireTenantId();

    for (const category of categories) {
      const { name, subCategories, parentId } = category;

      const existingCategoryByName = await this.prisma.category.findFirst({
        where: {
          name,
          type: CategoryTypes.INVENTORY,
          tenantId, // ✅ Filter by tenant
        },
      });

      if (existingCategoryByName) {
        throw new ConflictException(
          `An inventory category with this name: ${name} already exists`,
        );
      }

      if (parentId) {
        const existingParentCategory = await this.prisma.category.findFirst({
          where: {
            id: parentId,
            tenantId, // ✅ Filter by tenant
          },
        });

        if (!existingParentCategory) {
          throw new BadRequestException('Invalid Parent Id');
        }
      }

      await this.prisma.category.create({
        data: {
          name,
          deletedAt: null,
          ...(parentId ? { parentId } : {}),
          type: CategoryTypes.INVENTORY,
          tenantId, // ✅ Add tenantId
          children: {
            create: subCategories?.map((subCat) => ({
              name: subCat.name,
              type: CategoryTypes.INVENTORY,
              tenantId, // ✅ Add tenantId to children
            })),
          },
        },
      });
    }

    return { message: MESSAGES.CREATED };
  }

  async getInventoryCategories() {
    const tenantId = this.tenantContext.requireTenantId();

    return await this.prisma.category.findMany({
      where: {
        type: CategoryTypes.INVENTORY,
        parent: null,
        tenantId, // ✅ Filter by tenant
        deletedAt: null // ✅ Optional soft-delete support,
      },
      include: {
        children: {
          where: {
            tenantId, // ✅ Filter children by tenant
            deletedAt: null,
          },
        },
      },
    });
  }

  async getInventoryStats() {
    const tenantId = this.tenantContext.requireTenantId();
    const inventoryClassCounts = await this.prisma.inventory.groupBy({
      by: ['class'],
      _count: {
        class: true,
      },
      where: {
        tenantId, // ✅ Filter by tenant
        deletedAt: null,
      },
    });

    const transformedClassCounts = inventoryClassCounts.map((item) => ({
      inventoryClass: item.class,
      count: item._count.class,
    }));

    const totalInventoryCount = await this.prisma.inventory.count({
      where: {
        tenantId, // ✅ Filter by tenant
        deletedAt: null,
      },
    });

    const deletedInventoryCount = await this.prisma.inventory.count({
      where: {
        deletedAt: {
          not: null,
        },
        tenantId, // ✅ Filter by tenant
      },
    });

    return {
      inventoryClassCounts: transformedClassCounts,
      totalInventoryCount,
      deletedInventoryCount,
    };
  }

  async getInventoryTabs(inventoryId: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const inventory = await this.prisma.inventory.findUnique({
      where: {
        id: inventoryId,
        tenantId, // ✅ Filter by tenant
      },
    });

    if (!inventory) throw new NotFoundException(MESSAGES.INVENTORY_NOT_FOUND);

    const tabs = [
      {
        name: 'Details',
        url: `/inventory/${inventoryId}`,
      },
      {
        name: 'History',
        url: `/inventory/${inventoryId}/history`,
      },
      {
        name: 'Stats',
        url: `/inventory/${inventoryId}/stats`,
      },
    ];

    return tabs;
  }

  async updateInventory(
    inventoryId: string,
    updateInventoryDto: UpdateInventoryDto,
    file?: Express.Multer.File,
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const existingInventory = await this.prisma.inventory.findFirst({
      where: {
        id: inventoryId,
        tenantId,
      },
    });

    if (!existingInventory) {
      throw new NotFoundException("Inventory not found");
    }
    let image = existingInventory.image;
    if (file) {
      const uploaded = await this.uploadInventoryImage(file);
      image = uploaded.secure_url || uploaded.url;
    }

    await this.prisma.inventory.update({
      where: {
        id: inventoryId,
      },
      data: {
        ...updateInventoryDto,
        image,
      },
    });
    return { message: "Inventory updated successfully" };
  }

  mapInventoryToResponseDto(
    inventory: Prisma.InventoryGetPayload<{
      include: {
        inventoryCategory: true;
        inventorySubCategory: true;
        batches: {
          include: {
            creatorDetails: {
              select: {
                firstname: true;
                lastname: true;
              };
            };
          };
        };
      };
    }>,
  ) {
    const { batches, inventoryCategory, inventorySubCategory, ...rest } =
      inventory;
    const salePrice = {
      minimumInventoryBatchPrice: 0,
      maximumInventoryBatchPrice: 0,
    };
    if (batches.length) {
      const batchPrices = batches
        .filter(({ remainingQuantity }) => remainingQuantity > 0)
        .map((batch) => batch.price);
      const minimumInventoryBatchPrice = Math.floor(Math.min(...batchPrices));
      const maximumInventoryBatchPrice = Math.ceil(Math.max(...batchPrices));
      salePrice.minimumInventoryBatchPrice = minimumInventoryBatchPrice;
      salePrice.maximumInventoryBatchPrice = maximumInventoryBatchPrice;
    }
    const inventoryValue = batches.reduce(
      (sum, batch) => sum + batch.remainingQuantity * batch.price,
      0,
    );

    const totalRemainingQuantities = batches.reduce(
      (sum, batch) => sum + batch.remainingQuantity,
      0,
    );

    const totalInitialQuantities = batches.reduce(
      (sum, batch) => sum + batch.numberOfStock,
      0,
    );

    const updatedBatches = batches.map((batch) => ({
      ...batch,
      stockValue: (batch.remainingQuantity * batch.price).toFixed(2),
    }));

    return {
      ...rest,
      inventoryCategory: plainToInstance(CategoryEntity, inventoryCategory),
      inventorySubCategory: plainToInstance(
        CategoryEntity,
        inventorySubCategory,
      ),
      batches: plainToInstance(InventoryBatchEntity, updatedBatches),
      salePrice,
      inventoryValue,
      totalRemainingQuantities,
      totalInitialQuantities,
    };
  }

  async deleteInventory(id: string) {
    // find inventory
    const tenantId = this.tenantContext.requireTenantId();
    const existingInventory = await this.prisma.inventory.findFirst({
      where: {
        id: id,
        tenantId,
      },
    });

    if (!existingInventory) {
      throw new NotFoundException("Inventory not found");
    }
    // check if inventory , and do a soft delete, ensure our app can handle soft delete
    await this.prisma.inventory.update({
      where: {
        id: id,
        tenantId,
      },
      data: { deletedAt: new Date() },
    });
    return { message: "Inventory deleted successfully" }
  }

  async getInventorySubCategories() {
    const tenantId = this.tenantContext.requireTenantId();

    return await this.prisma.category.findMany({
      where: {
        type: CategoryTypes.INVENTORY,
        tenantId,
        deletedAt: null,
        NOT: {
          parent: null, // ✅ Ensure it's a subcategory (i.e., has a parent)
        },
        //deletedAt: { equals: null }, // ✅ Optional soft-delete support
      },
      include: {
        parent: true, // 👈 Include parent details if needed
      },
    });
  }

  async updateInventoryCategory(id: string, categories: UpdateInventoryDto) {
    // const existingCategoryNames = [];
    const tenantId = this.tenantContext.requireTenantId();
    const existingCategoryByName = await this.prisma.category.findFirst({
      where: {
        id,
        tenantId, // ✅ Filter by tenant
      },
    });

    if (!existingCategoryByName) {
      throw new ConflictException(
        `Inventory category does not  exists`,
      );
    }

    await this.prisma.category.update({
      where: {
        id: id,
      },
      data: {
        ...categories,
      },
    });

    return { message: MESSAGES.CREATED };
  }

  async deleteInventoryCategory(id: string) {
    // find inventory Category
    const tenantId = this.tenantContext.requireTenantId();
    const existingCategory = await this.prisma.category.findFirst({
      where: {
        id: id,
        tenantId,
      },
    });

    if (!existingCategory) {
      throw new NotFoundException("Inventory category not found");
    }
    // check if inventory , and do a soft delete, ensure our app can handle soft delete
    await this.prisma.category.update({
      where: {
        id: id,
        tenantId,
      },
      data: { deletedAt: new Date() },
    });
    // implement soft delete for children relationship if it exists

    return { message: "Inventory category deleted successfully" }
  }
}
