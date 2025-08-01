import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreContext } from './context/store.context';
import { TenantContext } from '../tenants/context/tenant.context';

export interface AddInventoryToStoreDto {
  inventoryId: string;
  quantity: number;
  batchId?: string; // Optional - if provided, adds to specific batch
  pricePerUnit?: number; // Only used for batch-specific inventory
}

export interface TransferInventoryDto {
  fromStoreId: string;
  toStoreId: string;
  inventoryId: string;
  quantity: number;
  batchId?: string; // Optional - transfer specific batch
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
   * Add inventory to store - works for both aggregate and batch-specific
   */
  async addInventoryToStore(storeId: string, dto: AddInventoryToStoreDto) {
    const tenantId = this.tenantContext.requireTenantId();

    // Verify store and inventory exist
    const [store, inventory] = await Promise.all([
      this.prisma.store.findFirst({ where: { id: storeId, tenantId } }),
      this.prisma.inventory.findFirst({ where: { id: dto.inventoryId, tenantId } })
    ]);

    if (!store || !inventory) {
      throw new NotFoundException('Store or inventory not found');
    }

    // If batch specified, verify it exists
    if (dto.batchId) {
      const batch = await this.prisma.inventoryBatch.findFirst({
        where: { id: dto.batchId, inventoryId: dto.inventoryId, tenantId }
      });
      if (!batch) {
        throw new NotFoundException('Batch not found');
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      // Find or create store inventory record
      const existingRecord = await tx.storeInventory.findFirst({
        where: {
          storeId,
          inventoryId: dto.inventoryId,
          inventoryBatchId: dto.batchId || null
        }
      });

      if (existingRecord) {
        // Update existing record
        return await tx.storeInventory.update({
          where: { id: existingRecord.id },
          data: {
            quantity: existingRecord.quantity + dto.quantity,
            pricePerUnit: dto.pricePerUnit || existingRecord.pricePerUnit
          }
        });
      } else {
        // Create new record
        return await tx.storeInventory.create({
          data: {
            storeId,
            inventoryId: dto.inventoryId,
            inventoryBatchId: dto.batchId,
            quantity: dto.quantity,
            pricePerUnit: dto.pricePerUnit,
            tenantId
          }
        });
      }
    });
  }

  /**
   * Get store inventory - automatically aggregates batch data if needed
   */
  async getStoreInventory(storeId: string, includeBatches = false) {
    const tenantId = this.tenantContext.requireTenantId();

    if (includeBatches) {
      // Return both aggregate and batch-level data
      return await this.prisma.storeInventory.findMany({
        where: { storeId, tenantId },
        include: {
          inventory: true,
          inventoryBatch: true,
          store: true
        },
        orderBy: [
          { inventoryId: 'asc' },
          { inventoryBatchId: 'asc' }
        ]
      });
    } else {
      // Return only aggregate data (records without batchId)
      return await this.prisma.storeInventory.findMany({
        where: { 
          storeId, 
          tenantId,
          inventoryBatchId: null // Only aggregate records
        },
        include: {
          inventory: true,
          store: true
        }
      });
    }
  }

  /**
   * Transfer inventory between stores
   */
  async transferInventory(dto: TransferInventoryDto, userContext?: { userId?: string }) {
    const tenantId = this.tenantContext.requireTenantId();
    const userId = userContext?.userId;

    // Verify stores exist
    const [fromStore, toStore] = await Promise.all([
      this.prisma.store.findFirst({ where: { id: dto.fromStoreId, tenantId } }),
      this.prisma.store.findFirst({ where: { id: dto.toStoreId, tenantId } })
    ]);

    if (!fromStore || !toStore) {
      throw new NotFoundException('Source or destination store not found');
    }

    return await this.prisma.$transaction(async (tx) => {
      // Find source inventory
      const sourceRecord = await tx.storeInventory.findFirst({
        where: {
          storeId: dto.fromStoreId,
          inventoryId: dto.inventoryId,
          inventoryBatchId: dto.batchId || null,
          quantity: { gte: dto.quantity }
        }
      });

      if (!sourceRecord) {
        throw new BadRequestException('Insufficient inventory in source store');
      }

      // Reduce quantity in source store
      await tx.storeInventory.update({
        where: { id: sourceRecord.id },
        data: { quantity: sourceRecord.quantity - dto.quantity }
      });

      // Add to destination store
      const destRecord = await tx.storeInventory.findFirst({
        where: {
          storeId: dto.toStoreId,
          inventoryId: dto.inventoryId,
          inventoryBatchId: dto.batchId || null
        }
      });

      if (destRecord) {
        await tx.storeInventory.update({
          where: { id: destRecord.id },
          data: { quantity: destRecord.quantity + dto.quantity }
        });
      } else {
        await tx.storeInventory.create({
          data: {
            storeId: dto.toStoreId,
            inventoryId: dto.inventoryId,
            inventoryBatchId: dto.batchId,
            quantity: dto.quantity,
            pricePerUnit: sourceRecord.pricePerUnit,
            sourceStoreId: dto.fromStoreId,
            tenantId
          }
        });
      }

      // Create transfer record using existing StoreTransfer model
      return await tx.storeTransfer.create({
        data: {
          transferNumber: `T-${Date.now()}`,
          fromStoreId: dto.fromStoreId,
          toStoreId: dto.toStoreId,
          inventoryId: dto.inventoryId,
          quantity: dto.quantity,
          notes: dto.notes,
          initiatedBy: userId || 'system', // Use provided userId or fallback
          tenantId
        }
      });
    });
  }

  /**
   * Get batch-specific inventory for a store
   */
  async getStoreBatchInventory(storeId: string, inventoryId?: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const where: any = {
      storeId,
      tenantId,
      inventoryBatchId: { not: null }, // Only batch records
      quantity: { gt: 0 }
    };

    if (inventoryId) {
      where.inventoryId = inventoryId;
    }

    return await this.prisma.storeInventory.findMany({
      where,
      include: {
        inventory: true,
        inventoryBatch: {
          include: {
            inventory: true
          }
        }
      },
      orderBy: [
        { inventoryId: 'asc' },
        { inventoryBatch: { batchNumber: 'asc' } }
      ]
    });
  }

  /**
   * Auto-allocate inventory using FIFO/LIFO strategy
   */
  async autoAllocateInventory(
    storeId: string, 
    inventoryId: string, 
    quantity: number,
    strategy: 'FIFO' | 'LIFO' = 'FIFO'
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    // Get available batches
    const availableBatches = await this.prisma.inventoryBatch.findMany({
      where: {
        inventoryId,
        tenantId,
        remainingQuantity: { gt: 0 }
      },
      orderBy: strategy === 'FIFO' 
        ? { batchNumber: 'asc' }
        : { batchNumber: 'desc' }
    });

    const allocations = [];
    let remainingQuantity = quantity;

    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;

      const allocateQty = Math.min(remainingQuantity, batch.remainingQuantity);
      
      await this.addInventoryToStore(storeId, {
        inventoryId,
        quantity: allocateQty,
        batchId: batch.id,
        pricePerUnit: batch.price
      });

      allocations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity: allocateQty
      });

      remainingQuantity -= allocateQty;
    }

    return {
      allocations,
      fullyAllocated: remainingQuantity === 0,
      shortfall: remainingQuantity
    };
  }
}