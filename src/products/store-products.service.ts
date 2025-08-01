import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateProductDto } from './dto/create-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { MESSAGES } from '../constants';
import { CreateProductCategoryDto } from './dto/create-category.dto';
import { CategoryTypes, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { CategoryEntity } from 'src/utils/entity/category';
import { TenantContext } from '../tenants/context/tenant.context';
import { StoreContext } from '../stores/context/store.context';
import { StorageService } from 'config/storage.provider';

/**
 * Store-scoped Products Service
 * All operations are automatically scoped to both tenant and store context
 */
@Injectable()
export class StoreProductsService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
  ) {}

  async uploadProductImage(file: Express.Multer.File) {
    let storage = await this.storageService.uploadFile(file, 'products');
    return await storage;
  }

  /**
   * Create a product scoped to current store
   */
  async create(
    createProductDto: CreateProductDto,
    file: Express.Multer.File,
    creatorId: string,
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    const {
      name,
      description,
      currency,
      paymentModes,
      categoryId,
      inventories,
    } = createProductDto;

    // Validate category exists in tenant and is accessible to store
    const isCategoryValid = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        type: CategoryTypes.PRODUCT,
        tenantId,
        // Categories can be tenant-wide or store-specific
        OR: [
          { storeId: storeId },
          { storeId: null }, // Tenant-wide categories
        ],
      },
    });

    if (!isCategoryValid) {
      throw new BadRequestException('Invalid Product Category for this store');
    }

    const productInventoryIds = inventories?.map((ivt) => ivt.inventoryId);

    if (productInventoryIds.length === 0) {
      throw new BadRequestException('No inventory IDs provided.');
    }

    // Validate inventories exist in the current store
    const inventoriesFromDb = await this.prisma.storeInventory.findMany({
      where: {
        inventoryId: {
          in: productInventoryIds,
        },
        storeId,
        tenantId,
      },
      select: {
        inventoryId: true,
        inventory: {
          select: {
            id: true,
          },
        },
      },
    });

    const validInventoryIds = new Set(
      inventoriesFromDb.map((storeInv) => storeInv.inventoryId),
    );
    const invalidInventoryIds = productInventoryIds.filter(
      (id) => !validInventoryIds.has(id),
    );

    if (invalidInventoryIds.length > 0) {
      throw new BadRequestException(
        `Invalid inventory IDs for this store: ${invalidInventoryIds.join(', ')}`,
      );
    }

    const ProductImage = await this.uploadProductImage(file);
    const image = ProductImage.secure_url || ProductImage.url;

    // Create product with store scope
    const product = await this.prisma.product.create({
      data: {
        name,
        description,
        image,
        currency,
        paymentModes,
        categoryId,
        creatorId,
        tenantId,
        storeId, // ✅ Add store scoping
      },
    });

    // Create product inventory relationships
    await this.prisma.productInventory.createMany({
      data: inventories?.map(({ inventoryId, quantity }) => ({
        productId: product.id,
        inventoryId,
        quantity,
        tenantId,
        storeId, // ✅ Add store scoping
      })),
    });

    return product;
  }

  /**
   * Get all products for current store
   */
  async getAllProducts(getProductsDto: GetProductsDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    const {
      page = 1,
      limit = 10,
      categoryId,
      createdAt,
      updatedAt,
      sortField,
      sortOrder,
      search,
    } = getProductsDto;

    const whereConditions: Prisma.ProductWhereInput = {
      AND: [
        { tenantId },
        { storeId }, // ✅ Always filter by store
        search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {},
        categoryId ? { categoryId } : {},
        createdAt
          ? {
              createdAt: {
                gte: new Date(createdAt),
                lt: new Date(
                  new Date(createdAt).setDate(new Date(createdAt).getDate() + 1),
                ),
              },
            }
          : {},
        updatedAt
          ? {
              updatedAt: {
                gte: new Date(updatedAt),
                lt: new Date(
                  new Date(updatedAt).setDate(new Date(updatedAt).getDate() + 1),
                ),
              },
            }
          : {},
      ],
    };

    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const orderBy = {
      [sortField || 'createdAt']: sortOrder || 'asc',
    };

    // Fetch products with store-specific inventory data
    const result = await this.prisma.product.findMany({
      where: whereConditions,
      skip,
      take,
      orderBy,
      include: {
        category: true,
        creatorDetails: true,
        inventories: {
          where: {
            storeId, // ✅ Only get inventory for current store
          },
          include: {
            inventory: {
              include: {
                storeInventories: {
                  where: {
                    storeId,
                  },
                  include: {
                    batches: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const updatedResults = result.map((product) =>
      this.mapProductToResponseDto(product, storeId),
    );

    const total = await this.prisma.product.count({
      where: whereConditions,
    });

    return {
      updatedResults,
      total,
      page,
      totalPages: limit === 0 ? 0 : Math.ceil(total / limit),
      limit,
    };
  }

  /**
   * Get a specific product for current store
   */
  async getProduct(id: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    const product = await this.prisma.product.findUnique({
      where: {
        id,
        tenantId,
        storeId, // ✅ Filter by store
      },
      include: {
        category: true,
        creatorDetails: true,
        inventories: {
          where: {
            storeId,
          },
          include: {
            inventory: {
              include: {
                storeInventories: {
                  where: {
                    storeId,
                  },
                  include: {
                    batches: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found in this store');
    }

    return this.mapProductToResponseDto(product, storeId);
  }

  /**
   * Create product category for current store
   */
  async createProductCategory(createProductCategoryDto: CreateProductCategoryDto) {
    const { name } = createProductCategoryDto;
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    // Check if category exists in this store or tenant-wide
    const categoryExists = await this.prisma.category.findFirst({
      where: {
        name,
        type: CategoryTypes.PRODUCT,
        tenantId,
        OR: [
          { storeId: storeId },
          { storeId: null }, // Tenant-wide categories
        ],
      },
    });

    if (categoryExists) {
      throw new ConflictException(
        `A product category with this name: ${name} already exists in this store`,
      );
    }

    return this.prisma.category.create({
      data: {
        name,
        type: CategoryTypes.PRODUCT,
        tenantId,
        storeId, // ✅ Store-specific category
      },
    });
  }

  /**
   * Get all categories available to current store
   */
  async getAllCategories() {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return await this.prisma.category.findMany({
      where: {
        type: CategoryTypes.PRODUCT,
        tenantId,
        OR: [
          { storeId: storeId }, // Store-specific categories
          { storeId: null }, // Tenant-wide categories
        ],
      },
      include: {
        parent: true,
        children: {
          where: {
            OR: [
              { storeId: storeId },
              { storeId: null },
            ],
          },
        },
      },
    });
  }

  /**
   * Get product tabs for current store
   */
  async getProductTabs(productId: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
        tenantId,
        storeId,
      },
      select: {
        _count: {
          select: {
            customers: {
              where: {
                // Count customers who bought this product from this store
                sales: {
                  some: {
                    storeId,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found in this store');
    }

    const tabs = [
      {
        name: 'Product Details',
        url: `/product/${productId}/details`,
      },
      {
        name: 'Stats',
        url: `/product/${productId}/stats`,
      },
      {
        name: 'Inventory Details',
        url: `/product/${productId}/inventory`,
      },
      {
        name: 'Customers',
        url: `/product/${productId}/customers`,
        count: product._count.customers,
      },
    ];

    return tabs;
  }

  /**
   * Get product inventory for current store
   */
  async getProductInventory(productId: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    const inventoryBatch = await this.prisma.product.findUnique({
      where: {
        id: productId,
        tenantId,
        storeId,
      },
      include: {
        inventories: {
          where: {
            storeId,
          },
          include: {
            inventory: {
              include: {
                storeInventories: {
                  where: {
                    storeId,
                  },
                  include: {
                    batches: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!inventoryBatch) {
      throw new NotFoundException('Product not found in this store');
    }

    return inventoryBatch;
  }

  /**
   * Get product statistics for current store
   */
  async getProductStatistics() {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    const allProducts = await this.prisma.product.count({
      where: {
        tenantId,
        storeId, // ✅ Count products in current store only
      },
    });

    return {
      allProducts,
      storeId,
    };
  }

  /**
   * Map product to response DTO with store-specific data
   */
  private mapProductToResponseDto(
    product: Prisma.ProductGetPayload<{
      include: {
        category: true;
        creatorDetails: true;
        inventories: {
          include: {
            inventory: {
              include: {
                storeInventories: {
                  include: {
                    batches: true;
                  };
                };
              };
            };
          };
        };
      };
    }>,
    storeId: string,
  ) {
    const { inventories, category, ...rest } = product;

    // Calculate price range based on store-specific inventory
    const { maximumInventoryBatchPrice, minimumInventoryBatchPrice } =
      inventories
        .map(({ quantity, inventory }) => {
          const storeInventory = inventory.storeInventories.find(
            (si) => si.storeId === storeId,
          );
          if (!storeInventory) return { min: 0, max: 0 };

          const { batches } = storeInventory;
          const batchPrices = batches
            .filter(({ remainingQuantity }) => remainingQuantity > 0)
            .map((batch) => batch.price * quantity);

          return {
            minimumInventoryBatchPrice: batchPrices.length
              ? Math.min(...batchPrices)
              : 0.0,
            maximumInventoryBatchPrice: batchPrices.length
              ? Math.max(...batchPrices)
              : 0.0,
          };
        })
        .reduce(
          (prev, curr) => {
            prev.minimumInventoryBatchPrice += curr.minimumInventoryBatchPrice;
            prev.maximumInventoryBatchPrice += curr.maximumInventoryBatchPrice;
            return prev;
          },
          {
            minimumInventoryBatchPrice: 0,
            maximumInventoryBatchPrice: 0,
          },
        );

    const priceRange = {
      minimumInventoryBatchPrice: minimumInventoryBatchPrice.toFixed(2),
      maximumInventoryBatchPrice: maximumInventoryBatchPrice.toFixed(2),
    };

    return {
      ...rest,
      inventories: inventories.map(({ quantity, inventory }) => {
        const storeInventory = inventory.storeInventories.find(
          (si) => si.storeId === storeId,
        );

        if (!storeInventory) {
          return {
            ...inventory,
            totalRemainingQuantities: 0,
            totalInitialQuantities: 0,
            productInventoryQuantity: quantity,
          };
        }

        const { batches } = storeInventory;

        const totalRemainingQuantities = batches.reduce(
          (sum, batch) => sum + batch.remainingQuantity,
          0,
        );

        const totalInitialQuantities = batches.reduce(
          (sum, batch) => sum + batch.numberOfStock,
          0,
        );

        return {
          ...inventory,
          totalRemainingQuantities,
          totalInitialQuantities,
          productInventoryQuantity: quantity,
        };
      }),
      category: plainToInstance(CategoryEntity, category),
      priceRange,
      storeId, // Include store ID in response
    };
  }
}