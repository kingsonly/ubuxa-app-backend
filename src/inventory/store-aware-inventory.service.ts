import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenants/context/tenant.context';
import { TenantConfigurationService } from '../tenants/tenant-configuration.service';
import { StoreType, TenantStoreType } from '@prisma/client';
import { CreateInventoryDto } from './dto/create-inventory.dto';

@Injectable()
export class StoreAwareInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly tenantConfigService: TenantConfigurationService
  ) {}

  async createInventoryWithStoreDistribution(
    requestUserId: string,
    createInventoryDto: CreateInventoryDto,
    file: Express.Multer.File,
    initialStoreDistribution?: { storeId: string; quantity: number }[]
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    
    // Check if multi-store is enabled
    const multiStoreStatus = await this.tenantConfigService.getMultiStoreStatus(tenantId);
    
    // Only main stores can create inventory items
    if (multiStoreStatus.isMultiStoreEnabled) {
      const userStoreAccess = await this.getUserMainStoreAccess(requestUserId, tenantId);
      if (!userStoreAccess) {
        throw new ForbiddenException('Only main store users can create inventory items');
      }
    }

    // Use transaction to create inventory and distribute to stores
    return this.prisma.$transaction(async (tx) => {
      // Validate categories
      const { inventorySubCategoryId, inventoryCategoryId } = createInventoryDto;
      const isCategoryValid = await tx.category.findFirst({
        where: {
          id: inventoryCategoryId,
          tenantId,
          children: {
            some: {
              id: inventorySubCategoryId,
              type: 'INVENTORY',
            },
          },
          type: 'INVENTORY',
        },
      });

      if (!isCategoryValid) {
        throw new BadRequestException('Invalid inventorySubCategoryId or inventoryCategoryId');
      }

      // Create inventory item
      const inventory = await tx.inventory.create({
        data: {
          name: createInventoryDto.name,
          manufacturerName: createInventoryDto.manufacturerName,
          dateOfManufacture: createInventoryDto.dateOfManufacture,
          sku: createInventoryDto.sku,
          image: file ? 'processed_image_url' : null, // Handle file upload
          class: createInventoryDto.class,
          inventoryCategoryId: createInventoryDto.inventoryCategoryId,
          inventorySubCategoryId: createInventoryDto.inventorySubCategoryId,
          tenantId,
        },
      });

      // Create inventory batch
      const batch = await tx.inventoryBatch.create({
        data: {
          creatorId: requestUserId,
          inventoryId: inventory.id,
          batchNumber: Date.now() - 100,
          costOfItem: parseFloat(createInventoryDto.costOfItem),
          price: parseFloat(createInventoryDto.price),
          numberOfStock: createInventoryDto.numberOfStock,
          remainingQuantity: createInventoryDto.numberOfStock,
          tenantId,
        },
      });

      // Handle store distribution
      if (multiStoreStatus.isMultiStoreEnabled && multiStoreStatus.mainStore) {
        const mainStore = multiStoreStatus.mainStore;
        
        if (initialStoreDistribution && initialStoreDistribution.length > 0) {
          // Distribute to specified stores
          for (const distribution of initialStoreDistribution) {
            await tx.storeInventory.create({
              data: {
                storeId: distribution.storeId,
                inventoryId: inventory.id,
                quantity: distribution.quantity,
                rootSourceStoreId: mainStore.id,
                tenantId,
              }
            });
          }
        } else {
          // Add all inventory to main store by default
          await tx.storeInventory.create({
            data: {
              storeId: mainStore.id,
              inventoryId: inventory.id,
              quantity: createInventoryDto.numberOfStock,
              rootSourceStoreId: mainStore.id,
              tenantId,
            }
          });
        }
      }

      return { inventory, batch };
    });
  }

  async getInventoryWithStoreContext(
    inventoryId: string,
    storeId?: string
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    
    const multiStoreStatus = await this.tenantConfigService.getMultiStoreStatus(tenantId);
    
    if (!multiStoreStatus.isMultiStoreEnabled) {
      // Single store mode - return traditional inventory view
      return this.prisma.inventory.findUnique({
        where: { id: inventoryId, tenantId },
        include: {
          batches: {
            include: {
              creatorDetails: {
                select: { firstname: true, lastname: true }
              }
            }
          },
          inventoryCategory: true,
          inventorySubCategory: true
        }
      });
    }

    // Multi-store mode - return store-specific inventory view
    const baseInventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId, tenantId },
      include: {
        batches: {
          include: {
            creatorDetails: {
              select: { firstname: true, lastname: true }
            }
          }
        },
        inventoryCategory: true,
        inventorySubCategory: true,
        storeInventories: {
          include: {
            store: true
          },
          ...(storeId && { where: { storeId } })
        }
      }
    });

    if (!baseInventory) return null;

    // Calculate store-specific quantities
    const storeQuantities = baseInventory.storeInventories.reduce((acc, si) => {
      acc[si.storeId] = {
        quantity: si.quantity,
        reservedQuantity: si.reservedQuantity,
        storeName: si.store.name,
        storeType: si.store.type
      };
      return acc;
    }, {} as Record<string, any>);

    return {
      ...baseInventory,
      storeQuantities,
      totalQuantityAcrossStores: baseInventory.storeInventories.reduce(
        (sum, si) => sum + si.quantity, 0
      )
    };
  }

  async getInventoriesByStore(
    storeId: string,
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      categoryId?: string;
      stockLevel?: 'low' | 'out' | 'normal';
    } = {}
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const { page = 1, limit = 20, search, categoryId, stockLevel } = filters;

    // Validate multi-store access
    await this.tenantConfigService.validateMultiStoreOperation(tenantId, 'view store inventory');

    const skip = (page - 1) * limit;

    let whereClause: any = {
      tenantId,
      storeInventories: {
        some: { storeId }
      }
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { manufacturerName: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (categoryId) {
      whereClause.inventoryCategoryId = categoryId;
    }

    const inventories = await this.prisma.inventory.findMany({
      where: whereClause,
      skip,
      take: limit,
      include: {
        inventoryCategory: true,
        inventorySubCategory: true,
        storeInventories: {
          where: { storeId },
          include: { store: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Filter by stock level if specified
    let filteredInventories = inventories;
    if (stockLevel) {
      filteredInventories = inventories.filter(inv => {
        const storeInv = inv.storeInventories[0];
        if (!storeInv) return stockLevel === 'out';
        
        switch (stockLevel) {
          case 'out':
            return storeInv.quantity === 0;
          case 'low':
            return storeInv.quantity > 0 && 
                   storeInv.minimumThreshold && 
                   storeInv.quantity <= storeInv.minimumThreshold;
          case 'normal':
            return storeInv.quantity > (storeInv.minimumThreshold || 0);
          default:
            return true;
        }
      });
    }

    const total = await this.prisma.inventory.count({ where: whereClause });

    return {
      inventories: filteredInventories.map(inv => ({
        ...inv,
        storeQuantity: inv.storeInventories[0]?.quantity || 0,
        storeReserved: inv.storeInventories[0]?.reservedQuantity || 0,
        storeLowThreshold: inv.storeInventories[0]?.minimumThreshold,
        storeMaxThreshold: inv.storeInventories[0]?.maximumThreshold
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getInventoryDistributionSummary(inventoryId: string) {
    const tenantId = this.tenantContext.requireTenantId();
    
    await this.tenantConfigService.validateMultiStoreOperation(tenantId, 'view inventory distribution');

    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId, tenantId },
      include: {
        storeInventories: {
          include: {
            store: {
              include: { parent: true }
            }
          }
        }
      }
    });

    if (!inventory) {
      throw new BadRequestException('Inventory not found');
    }

    const distributionByStoreType = inventory.storeInventories.reduce((acc, si) => {
      const storeType = si.store.type;
      if (!acc[storeType]) {
        acc[storeType] = { quantity: 0, stores: [] };
      }
      acc[storeType].quantity += si.quantity;
      acc[storeType].stores.push({
        id: si.store.id,
        name: si.store.name,
        quantity: si.quantity,
        region: si.store.region
      });
      return acc;
    }, {} as Record<string, any>);

    return {
      inventoryId,
      totalQuantity: inventory.storeInventories.reduce((sum, si) => sum + si.quantity, 0),
      distributionByStoreType,
      totalStores: inventory.storeInventories.length
    };
  }

  private async getUserMainStoreAccess(userId: string, tenantId: string) {
    const userStoreAccess = await this.prisma.storeUser.findFirst({
      where: {
        userId,
        store: {
          tenantId,
          type: StoreType.MAIN
        }
      },
      include: { store: true, role: true }
    });

    return userStoreAccess;
  }

  async validateStoreInventoryOperation(
    inventoryId: string,
    storeId: string,
    requiredQuantity: number,
    operation: 'reserve' | 'consume' | 'transfer'
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    
    const storeInventory = await this.prisma.storeInventory.findFirst({
      where: { inventoryId, storeId, tenantId }
    });

    if (!storeInventory) {
      throw new BadRequestException('Inventory not available in this store');
    }

    const availableQuantity = storeInventory.quantity - storeInventory.reservedQuantity;

    if (availableQuantity < requiredQuantity) {
      throw new BadRequestException(
        `Insufficient inventory. Available: ${availableQuantity}, Required: ${requiredQuantity}`
      );
    }

    return storeInventory;
  }
}