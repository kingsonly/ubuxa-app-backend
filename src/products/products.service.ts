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
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { TenantContext } from '../tenants/context/tenant.context';
import { UpdateProductDto } from './dto/update-product.dto';
import { StorageService } from '../../config/storage.provider';
import { CategoryEntity } from '../utils/entity/category';

@Injectable()
export class ProductsService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) { }

  async uploadProductImage(file: Express.Multer.File) {
    // return await this.cloudinary.uploadFile(file).catch((e) => {
    //   throw e;
    // });

    const storage = await this.storageService.uploadFile(file, 'products');
    return await storage
  }

  async create(
    createProductDto: CreateProductDto,
    file: Express.Multer.File,
    creatorId: string,
  ) {

    const tenantId = this.tenantContext.requireTenantId();

    const {
      name,
      description,
      currency,
      paymentModes,
      categoryId,
      inventories,
      productCapacity,
      eaasDetails,
    } = createProductDto;

    const isCategoryValid = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        type: CategoryTypes.PRODUCT,
        tenantId, // ✅ Filter by tenant
      },
    });

    if (!isCategoryValid) {
      throw new BadRequestException('Invalid Product Category');
    }

    const productInventoryIds = inventories?.map((ivt) => ivt.inventoryId);



    if (productInventoryIds.length === 0) {
      throw new BadRequestException('No inventory IDs provided.');
    }


    // TODO: uncomment before merging, by then UB-21 would have been merged
    // // Find all inventories from the DB
    // const inventoriesFromDb = await this.prisma.inventory.findMany({
    //   where: {
    //     id: {
    //       in: productInventoryIds,
    //     },
    //     tenantId, // ✅ Filter by tenant
    //   },
    //   select: {
    //     id: true,
    //   },
    // });

    // // Find invalid inventory IDs by comparing with existing DB records
    // const validInventoryIds = new Set(
    //   inventoriesFromDb.map((inventory) => inventory.id),
    // );
    // const invalidInventoryIds = productInventoryIds.filter(
    //   (id) => !validInventoryIds.has(id),
    // );

    // if (invalidInventoryIds.length > 0) {
    //   throw new BadRequestException(
    //     `Invalid inventory IDs: ${invalidInventoryIds.join(', ')}`,
    //   );
    // }

    ////END

    // Find all inventories from the DB
    const inventoriesFromDb = await this.prisma.inventory.findMany({
      where: {
        id: {
          in: productInventoryIds,
        },
      },
      select: {
        id: true,
      },
    });


    // Find invalid inventory IDs by comparing with existing DB records
    const validInventoryIds = new Set(
      inventoriesFromDb.map((inventory) => inventory.id),
    );
    const invalidInventoryIds = productInventoryIds.filter(
      (id) => !validInventoryIds.has(id),
    );

    if (invalidInventoryIds.length > 0) {
      throw new BadRequestException(
        `Invalid inventory IDs: ${invalidInventoryIds.join(', ')}`,
      );
    }

    const ProductImage = (await this.uploadProductImage(file));
    const image = ProductImage.secure_url || ProductImage.url;

    const product = await this.prisma.product.create({
      data: {
        deletedAt: null,
        name,
        description,
        image,
        currency,
        paymentModes,
        categoryId,
        creatorId,
        tenantId, // ✅ Add tenantId
        productCapacity: productCapacity ? instanceToPlain(productCapacity) : null,
        eaasDetails: eaasDetails ? instanceToPlain(eaasDetails) : null,
      },
    });

    await this.prisma.productInventory.createMany({
      data: inventories?.map(({ inventoryId, quantity }) => ({
        productId: product.id,
        inventoryId,
        quantity,
        tenantId, // ✅ Add tenantId
      })),
    });

    return product;
  }

  async getAllProducts(getProductsDto: GetProductsDto) {

    const tenantId = this.tenantContext.requireTenantId();

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
        { tenantId }, // ✅ Always include tenantId
        { deletedAt: null },
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
      ],
    };

    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const orderBy = {
      [sortField || 'createdAt']: sortOrder || 'asc',
    };

    // Fetch products with pagination and filters
    const result = await this.prisma.product.findMany({
      where: whereConditions,
      skip,
      take,
      orderBy,
      include: {
        category: true,
        creatorDetails: true,
        inventories: {
          include: {
            inventory: {
              include: { batches: true },
            },
          },
        },
      },
    });

    const updatedResults = result.map(this.mapProductToResponseDto);

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

  async getProduct(id: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const product = await this.prisma.product.findUnique({
      where: {
        id,
        tenantId, // ✅ Filter by tenant
      },
      include: {
        category: true,
        creatorDetails: true,
        inventories: {
          include: {
            inventory: {
              include: { batches: true },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(MESSAGES.PRODUCT_NOT_FOUND);
    }

    return this.mapProductToResponseDto(product);
  }

  async createProductCategory(
    createProductCategoryDto: CreateProductCategoryDto,
  ) {
    // const tenantId = this.tenantContext.requireTenantId();
    const { name } = createProductCategoryDto;
    const tenantId = this.tenantContext.requireTenantId();

    const categoryExists = await this.prisma.category.findFirst({
      where: {
        name,
        type: CategoryTypes.PRODUCT,
        // tenantId, // ✅ Filter by tenant
      },
    });

    if (categoryExists) {
      throw new ConflictException(
        `A product category with this name: ${name} already exists`,
      );
    }

    return this.prisma.category.create({
      data: {
        name,
        deletedAt: null,
        type: CategoryTypes.PRODUCT,
        tenantId, // ✅ Add tenantId
      },
    });
  }

  async getAllCategories() {
    const tenantId = this.tenantContext.requireTenantId();
    return await this.prisma.category.findMany({
      where: {
        type: CategoryTypes.PRODUCT,
        tenantId,           // ✅ Only fetch categories for the current tenant
        deletedAt: null,    // ✅ Exclude soft-deleted categories
      },
      include: {
        parent: {
          where: {
            deletedAt: null, // ✅ Exclude soft-deleted parent
            tenantId,        // ✅ Ensure parent belongs to same tenant
          },
        },
        children: {
          where: {
            deletedAt: null, // ✅ Exclude soft-deleted children
            tenantId,        // ✅ Ensure children belong to same tenant
          },
        },
      },
    });
    // return await this.prisma.category.findMany({
    //   where: {
    //     type: CategoryTypes.PRODUCT,
    //     tenantId, // ✅ Filter by tenant
    //     deletedAt: null,
    //   },
    //   include: {
    //     parent: true,
    //     children: true,
    //   },
    // });
  }

  async getProductTabs(productId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
        tenantId, // ✅ Filter by tenant
      },
      select: {
        _count: {
          select: { customers: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(MESSAGES.PRODUCT_NOT_FOUND);
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

  async getProductInventory(productId: string) {

    const tenantId = this.tenantContext.requireTenantId();

    const inventoryBatch = await this.prisma.product.findUnique({
      where: {
        id: productId,
        tenantId, // ✅ Filter by tenant
      },
      include: {
        inventories: {
          include: {
            inventory: true,
          },
        },
      },
    });

    if (!inventoryBatch) {
      throw new NotFoundException(MESSAGES.PRODUCT_NOT_FOUND);
    }

    return inventoryBatch;
  }

  async getProductStatistics() {

    const tenantId = this.tenantContext.requireTenantId();

    const allProducts = await this.prisma.product.count(
      {
        where: {
          tenantId, // ✅ Filter by tenant
          deletedAt: null,
        },
      }
    );

    if (!allProducts) {
      throw new NotFoundException(MESSAGES.PRODUCT_NOT_FOUND);
    }

    return {
      allProducts,
    };
  }



  private mapProductToResponseDto(
    product: Prisma.ProductGetPayload<{
      include: {
        category: true;
        creatorDetails: true;
        inventories: {
          include: {
            inventory: {
              include: {
                batches: true;
                inventoryCategory: true;
                inventorySubCategory: true;
              };
            };
          };
        };
      };
    }>,
  ) {
    const { inventories, category, ...rest } = product;
    const { maximumInventoryBatchPrice, minimumInventoryBatchPrice } =
      inventories
        .map(({ quantity, inventory }) => {
          const { batches } = inventory;
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
        const { batches, ...rest } = inventory;

        const totalRemainingQuantities = batches.reduce(
          (sum, batch) => sum + batch.remainingQuantity,
          0,
        );

        const totalInitialQuantities = batches.reduce(
          (sum, batch) => sum + batch.numberOfStock,
          0,
        );

        return {
          ...rest,
          totalRemainingQuantities,
          totalInitialQuantities,
          productInventoryQuantity: quantity
        };
      }),
      category: plainToInstance(CategoryEntity, category),
      priceRange,
    };
  }

  async updateProduct(
    productId: string,
    updateProductDto: UpdateProductDto,
    file?: Express.Multer.File,
  ) {
    const {
      name,
      description,
      paymentModes,
      categoryId,
      productCapacity,
      eaasDetails,
    } = updateProductDto;
    const tenantId = this.tenantContext.requireTenantId();
    const existingProduct = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException("Product not found");
    }
    let image = existingProduct.image;
    if (file) {
      const uploaded = await this.uploadProductImage(file);
      image = uploaded.secure_url || uploaded.url;
    }

    await this.prisma.product.update({
      where: {
        id: productId,
        tenantId,
      },
      data: {
        name,
        description,
        paymentModes,
        categoryId,
        image,
        productCapacity: productCapacity ? instanceToPlain(productCapacity) : null,
        eaasDetails: eaasDetails ? instanceToPlain(eaasDetails) : null,
      },
    });
    return { message: "Product updated successfully" };
  }

  async deleteProduct(id: string) {
    // find product
    const tenantId = this.tenantContext.requireTenantId();
    const existingProduct = await this.prisma.product.findFirst({
      where: {
        id: id,
        tenantId,
      },
    });

    if (!existingProduct) {
      throw new NotFoundException("Product not found");
    }
    // check if Product , can do a soft delete, ensure our app can handle soft delete
    await this.prisma.product.update({
      where: {
        id: id,
        tenantId,
      },
      data: { deletedAt: new Date() },
    });
    return { message: "Product deleted successfully" }
  }
}
