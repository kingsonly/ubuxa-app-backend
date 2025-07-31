import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreType } from '@prisma/client';
import { StoreContext } from './context/store.context';
import { TenantContext } from '../tenants/context/tenant.context';

// DTOs for batch-aware inventory operations
export interface AddStoreBatchInventoryDto {
  inventoryId: string;
  inventoryBatchId: string;
  quantity: number;
  pricePerUnit: number;
  minimumThreshold?: number;
  maximumThreshold?: number;
}

export interface BatchAllocationDto {
  inventoryBatchId: string;
  quantity: number;
  pricePerUnit?: number; // Optional override
}

export interface AllocateInventoryBatchesToStoreDto {
  inventoryId: string;
  batchAllocations: BatchAllocationDto[];
  totalQuantity: number;
}

export interface StoreBatchInventoryFilterDto {
  page?: number;
  limit?: number;
  search?: string;
  stockLevel?: 'out_of_stock' | 'low_stock' | 'in_stock';
  sortBy?: 'expiry_date' | 'batch_number' | 'quantity' | 'price';
  sortOrder?: 'asc' | 'desc';
  includeExpired?: boolean;
}

export interface BatchTransferDto {
  fromStoreId: string;
  toStoreId: string;
  inventoryId: string;
  batchAllocations: BatchAllocationDto[];
  transferType?: 'DISTRIBUTION' | 'REQUEST_FULFILLMENT' | 'EMERGENCY' | 'REBALANCING';
  notes?: string;
}

@Injectable()
export class StoreBatchInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContext,
    private readonly tenantContext: TenantContext
  ) {}

  /**
   * Allocate specific inventory batches to a store
   * This is the primary method for adding batch-aware inventory to stores
   */
  async allocateInventoryBatchesToStore(
    storeId: string,
    dto: AllocateInventoryBatchesToStoreDto,
    userContext?: { tenantId?: string, userId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const userId = userContext?.userId;

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
      where: { id: dto.inventoryId, tenantId },
      include: {
        batches: {
          where: {
            id: { in: dto.batchAllocations.map(b => b.inventoryBatchId) }
          }
        }
      }
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    // Verify all batches exist and have sufficient quantity
    const batchMap = new Map(inventory.batches.map(b => [b.id, b]));
    
    for (const allocation of dto.batchAllocations) {
      const batch = batchMap.get(allocation.inventoryBatchId);
      if (!batch) {
        throw new NotFoundException(`Batch ${allocation.inventoryBatchId} not found`);
      }
      
      if (batch.remainingQuantity < allocation.quantity) {
        throw new BadRequestException(
          `Insufficient quantity in batch ${batch.batchNumber}. Available: ${batch.remainingQuantity}, Requested: ${allocation.quantity}`
        );
      }
    }

    // Find main store as root source
    const mainStore = store.type === StoreType.MAIN ? store : 
      await this.prisma.store.findFirst({
        where: { tenantId, type: StoreType.MAIN }
      });

    if (!mainStore) {
      throw new BadRequestException('Main store not found');
    }

    // Use transaction to ensure consistency
    return await this.prisma.$transaction(async (tx) => {
      const allocatedBatches = [];

      for (const allocation of dto.batchAllocations) {
        const batch = batchMap.get(allocation.inventoryBatchId)!;
        
        // Check if store batch inventory already exists
        const existingStoreBatch = await tx.storeBatchInventory.findFirst({
          where: {
            storeId,
            inventoryId: dto.inventoryId,
            inventoryBatchId: allocation.inventoryBatchId
          }
        });

        if (existingStoreBatch) {
          // Update existing allocation
          const updated = await tx.storeBatchInventory.update({
            where: { id: existingStoreBatch.id },
            data: {
              quantity: existingStoreBatch.quantity + allocation.quantity,
              allocatedQuantity: existingStoreBatch.allocatedQuantity + allocation.quantity,
              pricePerUnit: allocation.pricePerUnit || existingStoreBatch.pricePerUnit,
            },
            include: {
              inventoryBatch: true,
              inventory: true,
              store: true
            }
          });
          allocatedBatches.push(updated);
        } else {
          // Create new allocation
          const created = await tx.storeBatchInventory.create({
            data: {
              storeId,
              inventoryId: dto.inventoryId,
              inventoryBatchId: allocation.inventoryBatchId,
              quantity: allocation.quantity,
              allocatedQuantity: allocation.quantity,
              pricePerUnit: allocation.pricePerUnit || batch.price,
              costPerUnit: batch.costOfItem,
              expiryDate: null, // Would need to be added to batch model
              rootSourceStoreId: mainStore.id,
              tenantId,
            },
            include: {
              inventoryBatch: true,
              inventory: true,
              store: true
            }
          });
          allocatedBatches.push(created);
        }

        // Update the original batch remaining quantity
        await tx.inventoryBatch.update({
          where: { id: allocation.inventoryBatchId },
          data: {
            remainingQuantity: batch.remainingQuantity - allocation.quantity
          }
        });
      }

      // Update or create aggregate store inventory record
      await this.updateAggregateStoreInventory(tx, storeId, dto.inventoryId, tenantId, mainStore.id);

      return allocatedBatches;
    });
  }

  /**
   * Get batch-aware inventory for a store with detailed batch information
   */
  async getStoreBatchInventory(
    storeId: string,
    filters: StoreBatchInventoryFilterDto,
    userContext?: { tenantId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const { 
      page = 1, 
      limit = 20, 
      search, 
      stockLevel, 
      sortBy = 'expiry_date',
      sortOrder = 'asc',
      includeExpired = false 
    } = filters;

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
      quantity: { gt: 0 } // Only show batches with quantity
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
          // This would need additional logic based on thresholds
          whereClause.quantity = { lte: 10 }; // Simplified
          break;
        case 'in_stock':
          whereClause.quantity = { gt: 0 };
          break;
      }
    }

    // Add expiry filter
    if (!includeExpired && sortBy === 'expiry_date') {
      whereClause.expiryDate = { gte: new Date() };
    }

    // Build sort clause
    const orderBy: any = {};
    switch (sortBy) {
      case 'expiry_date':
        orderBy.expiryDate = sortOrder;
        break;
      case 'batch_number':
        orderBy.inventoryBatch = { batchNumber: sortOrder };
        break;
      case 'quantity':
        orderBy.quantity = sortOrder;
        break;
      case 'price':
        orderBy.pricePerUnit = sortOrder;
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [storeBatchInventories, total] = await Promise.all([
      this.prisma.storeBatchInventory.findMany({
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
          inventoryBatch: true,
          store: true,
          rootSourceStore: true
        },
        orderBy
      }),
      this.prisma.storeBatchInventory.count({ where: whereClause })
    ]);

    return {
      items: storeBatchInventories,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: await this.getStoreBatchInventorySummary(storeId, tenantId)
    };
  }

  /**
   * Transfer batches between stores
   */
  async transferBatchesBetweenStores(
    dto: BatchTransferDto,
    userContext?: { tenantId?: string, userId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const userId = userContext?.userId;

    if (!userId) {
      throw new BadRequestException('User ID is required for transfers');
    }

    // Verify both stores exist
    const [fromStore, toStore] = await Promise.all([
      this.prisma.store.findFirst({ where: { id: dto.fromStoreId, tenantId } }),
      this.prisma.store.findFirst({ where: { id: dto.toStoreId, tenantId } })
    ]);

    if (!fromStore || !toStore) {
      throw new NotFoundException('One or both stores not found');
    }

    // Verify inventory exists
    const inventory = await this.prisma.inventory.findFirst({
      where: { id: dto.inventoryId, tenantId }
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found');
    }

    return await this.prisma.$transaction(async (tx) => {
      const transferResults = [];

      for (const allocation of dto.batchAllocations) {
        // Verify source store has sufficient batch quantity
        const sourceBatch = await tx.storeBatchInventory.findFirst({
          where: {
            storeId: dto.fromStoreId,
            inventoryId: dto.inventoryId,
            inventoryBatchId: allocation.inventoryBatchId,
            quantity: { gte: allocation.quantity }
          },
          include: { inventoryBatch: true }
        });

        if (!sourceBatch) {
          throw new BadRequestException(
            `Insufficient quantity in source store for batch ${allocation.inventoryBatchId}`
          );
        }

        // Create transfer record
        const transfer = await tx.storeBatchTransfer.create({
          data: {
            transferNumber: `BT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
            fromStoreId: dto.fromStoreId,
            toStoreId: dto.toStoreId,
            inventoryId: dto.inventoryId,
            inventoryBatchId: allocation.inventoryBatchId,
            quantity: allocation.quantity,
            transferType: dto.transferType || 'DISTRIBUTION',
            batchCostPerUnit: sourceBatch.costPerUnit,
            batchPricePerUnit: allocation.pricePerUnit || sourceBatch.pricePerUnit,
            batchExpiryDate: sourceBatch.expiryDate,
            initiatedBy: userId,
            tenantId,
            notes: dto.notes,
          }
        });

        // Reduce quantity in source store
        await tx.storeBatchInventory.update({
          where: { id: sourceBatch.id },
          data: {
            quantity: sourceBatch.quantity - allocation.quantity,
            reservedQuantity: sourceBatch.reservedQuantity + allocation.quantity
          }
        });

        // Add or update quantity in destination store
        const destBatch = await tx.storeBatchInventory.findFirst({
          where: {
            storeId: dto.toStoreId,
            inventoryId: dto.inventoryId,
            inventoryBatchId: allocation.inventoryBatchId
          }
        });

        if (destBatch) {
          await tx.storeBatchInventory.update({
            where: { id: destBatch.id },
            data: {
              quantity: destBatch.quantity + allocation.quantity,
              allocatedQuantity: destBatch.allocatedQuantity + allocation.quantity
            }
          });
        } else {
          await tx.storeBatchInventory.create({
            data: {
              storeId: dto.toStoreId,
              inventoryId: dto.inventoryId,
              inventoryBatchId: allocation.inventoryBatchId,
              quantity: allocation.quantity,
              allocatedQuantity: allocation.quantity,
              pricePerUnit: allocation.pricePerUnit || sourceBatch.pricePerUnit,
              costPerUnit: sourceBatch.costPerUnit,
              expiryDate: sourceBatch.expiryDate,
              rootSourceStoreId: sourceBatch.rootSourceStoreId,
              transferId: transfer.id,
              tenantId
            }
          });
        }

        transferResults.push(transfer);
      }

      // Update aggregate inventories for both stores
      await Promise.all([
        this.updateAggregateStoreInventory(tx, dto.fromStoreId, dto.inventoryId, tenantId, fromStore.id),
        this.updateAggregateStoreInventory(tx, dto.toStoreId, dto.inventoryId, tenantId, toStore.id)
      ]);

      return transferResults;
    });
  }

  /**
   * Get batch inventory summary for a store
   */
  private async getStoreBatchInventorySummary(storeId: string, tenantId: string) {
    const [
      totalBatches,
      totalQuantity,
      expiringSoon,
      lowStockBatches
    ] = await Promise.all([
      this.prisma.storeBatchInventory.count({
        where: { storeId, tenantId, quantity: { gt: 0 } }
      }),
      this.prisma.storeBatchInventory.aggregate({
        where: { storeId, tenantId },
        _sum: { quantity: true }
      }),
      this.prisma.storeBatchInventory.count({
        where: {
          storeId,
          tenantId,
          quantity: { gt: 0 },
          expiryDate: {
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          }
        }
      }),
      this.prisma.storeBatchInventory.count({
        where: {
          storeId,
          tenantId,
          quantity: { lte: 10 } // Simplified low stock threshold
        }
      })
    ]);

    return {
      totalBatches,
      totalQuantity: totalQuantity._sum.quantity || 0,
      expiringSoon,
      lowStockBatches
    };
  }

  /**
   * Update aggregate store inventory based on batch allocations
   */
  private async updateAggregateStoreInventory(
    tx: any,
    storeId: string,
    inventoryId: string,
    tenantId: string,
    rootSourceStoreId: string
  ) {
    // Calculate total quantity from all batches
    const batchTotals = await tx.storeBatchInventory.aggregate({
      where: { storeId, inventoryId, tenantId },
      _sum: {
        quantity: true,
        reservedQuantity: true
      }
    });

    const totalQuantity = batchTotals._sum.quantity || 0;
    const totalReserved = batchTotals._sum.reservedQuantity || 0;

    // Update or create aggregate store inventory
    const existingStoreInventory = await tx.storeInventory.findFirst({
      where: { storeId, inventoryId }
    });

    if (existingStoreInventory) {
      await tx.storeInventory.update({
        where: { id: existingStoreInventory.id },
        data: {
          quantity: totalQuantity,
          reservedQuantity: totalReserved
        }
      });
    } else {
      await tx.storeInventory.create({
        data: {
          storeId,
          inventoryId,
          quantity: totalQuantity,
          reservedQuantity: totalReserved,
          rootSourceStoreId,
          tenantId
        }
      });
    }
  }

  /**
   * Get available batches for allocation (FIFO/LIFO)
   */
  async getAvailableBatchesForAllocation(
    inventoryId: string,
    requestedQuantity: number,
    strategy: 'FIFO' | 'LIFO' = 'FIFO',
    userContext?: { tenantId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    const orderBy = strategy === 'FIFO' 
      ? { batchNumber: 'asc' as const }
      : { batchNumber: 'desc' as const };

    const availableBatches = await this.prisma.inventoryBatch.findMany({
      where: {
        inventoryId,
        tenantId,
        remainingQuantity: { gt: 0 }
      },
      orderBy,
      include: {
        inventory: true
      }
    });

    // Calculate optimal allocation
    const allocations: BatchAllocationDto[] = [];
    let remainingQuantity = requestedQuantity;

    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;

      const allocateQuantity = Math.min(remainingQuantity, batch.remainingQuantity);
      
      allocations.push({
        inventoryBatchId: batch.id,
        quantity: allocateQuantity,
        pricePerUnit: batch.price
      });

      remainingQuantity -= allocateQuantity;
    }

    return {
      allocations,
      fullyAllocated: remainingQuantity === 0,
      shortfall: remainingQuantity > 0 ? remainingQuantity : 0,
      totalBatches: availableBatches.length
    };
  }
}