import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreType } from '@prisma/client';
import { StoreContext } from './context/store.context';
import { TenantContext } from '../tenants/context/tenant.context';
import {
  AddStoreInventoryDto,
  UpdateStoreInventoryDto,
  StoreInventoryFilterDto
} from './dto/store-inventory.dto';

@Injectable()
export class StoreInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContext,
    private readonly tenantContext: TenantContext
  ) { }

  async addInventoryToStore(
    storeId: string,
    dto: AddStoreInventoryDto,
    userContext?: { tenantId?: string, userId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const userId = userContext?.userId; // This might come from JWT or other auth context

    // Verify store exists and user has access
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      include: { parent: true }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify inventory exists
    const inventory = await this.prisma.inventory.findFirst({
      where: { id: dto.inventoryId, tenantId }
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    // Only main stores can create new inventory items in stores
    // Other stores must receive inventory through transfers
    if (store.type !== StoreType.MAIN) {
      throw new ForbiddenException('Only main stores can directly add inventory items');
    }

    // Find main store as root source
    const mainStore = store.type === StoreType.MAIN ? store :
      await this.prisma.store.findFirst({
        where: { tenantId, type: StoreType.MAIN }
      });

    if (!mainStore) {
      throw new BadRequestException('Main store not found');
    }

    // Check if store inventory already exists
    const existingStoreInventory = await this.prisma.storeInventory.findFirst({
      where: { storeId, inventoryId: dto.inventoryId }
    });

    if (existingStoreInventory) {
      // Update existing inventory
      return this.prisma.storeInventory.update({
        where: { id: existingStoreInventory.id },
        data: {
          quantity: existingStoreInventory.quantity + dto.quantity,
          minimumThreshold: dto.minimumThreshold ?? existingStoreInventory.minimumThreshold,
          maximumThreshold: dto.maximumThreshold ?? existingStoreInventory.maximumThreshold,
        },
        include: {
          inventory: true,
          store: true
        }
      });
    }

    // Create new store inventory
    return this.prisma.storeInventory.create({
      data: {
        storeId,
        inventoryId: dto.inventoryId,
        quantity: dto.quantity,
        minimumThreshold: dto.minimumThreshold,
        maximumThreshold: dto.maximumThreshold,
        rootSourceStoreId: mainStore.id,
        tenantId,
      },
      include: {
        inventory: true,
        store: true
      }
    });
  }

  async getStoreInventory(
    storeId: string,
    filters: StoreInventoryFilterDto,
    userContext: { tenantId: string }
  ) {
    const { tenantId } = userContext;
    const { page = 1, limit = 20, search, stockLevel } = filters;

    // Verify store access
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const skip = (page - 1) * limit;

    const whereClause: any = {
      storeId,
      tenantId,
    };

    // Add search filter
    if (search) {
      whereClause.inventory = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { manufacturerName: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    // Add stock level filter
    if (stockLevel) {
      switch (stockLevel) {
        case 'out_of_stock':
          whereClause.quantity = 0;
          break;
        case 'low_stock':
          whereClause.AND = [
            { quantity: { gt: 0 } },
            { quantity: { lte: { minimumThreshold: true } } }
          ];
          break;
        case 'in_stock':
          whereClause.quantity = { gt: 0 };
          break;
      }
    }

    const [storeInventories, total] = await Promise.all([
      this.prisma.storeInventory.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          inventory: {
            include: {
              inventoryCategory: true,
              inventorySubCategory: true
            }
          },
          store: true,
          rootSourceStore: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.storeInventory.count({ where: whereClause })
    ]);

    return {
      items: storeInventories,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async updateStoreInventory(
    storeId: string,
    inventoryId: string,
    dto: UpdateStoreInventoryDto,
    userContext: { tenantId: string }
  ) {
    const { tenantId } = userContext;

    const storeInventory = await this.prisma.storeInventory.findFirst({
      where: { storeId, inventoryId, tenantId }
    });

    if (!storeInventory) {
      throw new NotFoundException('Store inventory not found');
    }

    return this.prisma.storeInventory.update({
      where: { id: storeInventory.id },
      data: {
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.minimumThreshold !== undefined && { minimumThreshold: dto.minimumThreshold }),
        ...(dto.maximumThreshold !== undefined && { maximumThreshold: dto.maximumThreshold }),
      },
      include: {
        inventory: true,
        store: true
      }
    });
  }

  async getStoreInventoryStats(storeId: string, userContext: { tenantId: string }) {
    const { tenantId } = userContext;

    // Verify store access
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const [
      totalItems,
      outOfStockItems,
      lowStockItems,
      totalValue
    ] = await Promise.all([
      this.prisma.storeInventory.count({
        where: { storeId, tenantId }
      }),
      this.prisma.storeInventory.count({
        where: { storeId, tenantId, quantity: 0 }
      }),
      this.prisma.storeInventory.count({
        where: {
          storeId,
          tenantId,
          quantity: { gt: 0 },
          minimumThreshold: { not: null },
          // This is a simplified check - in production you'd need a more complex query
        }
      }),
      this.prisma.storeInventory.aggregate({
        where: { storeId, tenantId },
        _sum: { quantity: true }
      })
    ]);

    return {
      totalItems,
      outOfStockItems,
      lowStockItems,
      totalQuantity: totalValue._sum.quantity || 0,
      stockHealth: {
        healthy: totalItems - outOfStockItems - lowStockItems,
        lowStock: lowStockItems,
        outOfStock: outOfStockItems
      }
    };
  }

  async getLowStockAlerts(storeId: string, userContext: { tenantId: string }) {
    const { tenantId } = userContext;

    const lowStockItems = await this.prisma.storeInventory.findMany({
      where: {
        storeId,
        tenantId,
        quantity: { gt: 0 },
        minimumThreshold: { not: null },
        // Add condition where quantity <= minimumThreshold
      },
      include: {
        inventory: true,
        store: true
      },
      orderBy: { quantity: 'asc' }
    });

    // Filter in application since Prisma doesn't support comparing fields directly
    return lowStockItems.filter(item =>
      item.minimumThreshold && item.quantity <= item.minimumThreshold
    );
  }

  /**
   * Add inventory to store with automatic batch allocation using simplified approach
   */
  async addInventoryToStoreWithBatchAllocation(
    storeId: string,
    dto: AddStoreInventoryDto & { allocationStrategy?: 'FIFO' | 'LIFO' },
    userContext?: { tenantId?: string, userId?: string }
  ) {
    // Use the simplified batch service
    const { StoreBatchInventoryService } = await import('./store-batch-inventory.service');
    const batchService = new StoreBatchInventoryService(this.prisma, this.storeContext, this.tenantContext);

    return await batchService.autoAllocateInventory(
      storeId,
      dto.inventoryId,
      dto.quantity,
      dto.allocationStrategy || 'FIFO'
    );
  }

  /**
   * Get store inventory with batch details using simplified approach
   */
  async getStoreInventoryWithBatches(
    storeId: string,
    includeBatches = true,
    userContext?: { tenantId?: string }
  ) {
    // Use the simplified batch service
    const { StoreBatchInventoryService } = await import('./store-batch-inventory.service');
    const batchService = new StoreBatchInventoryService(this.prisma, this.storeContext, this.tenantContext);

    return await batchService.getStoreInventory(storeId, includeBatches);
  }
}