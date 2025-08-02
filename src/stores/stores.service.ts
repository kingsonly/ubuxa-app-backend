import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store, User, StoreBatchAllocation } from '@prisma/client';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new store
   */
  async createStore(tenantId: string, createStoreDto: CreateStoreDto): Promise<Store> {
    // Check if tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check if tenant allows multiple stores
    if (!createStoreDto.isMain && tenant.storeType === 'SINGLE_STORE') {
      throw new BadRequestException('Tenant does not allow multiple stores');
    }

    // Check if store name is unique within tenant
    const existingStore = await this.prisma.store.findFirst({
      where: {
        tenantId,
        name: createStoreDto.name
      }
    });

    if (existingStore) {
      throw new BadRequestException('Store name must be unique within tenant');
    }

    // If this is marked as main store, ensure no other main store exists
    if (createStoreDto.type === 'MAIN') {
      const existingMainStore = await this.prisma.store.findFirst({
        where: {
          tenantId,
          type: 'MAIN'
        }
      });

      if (existingMainStore) {
        throw new BadRequestException('Tenant already has a main store');
      }
    }

    return this.prisma.store.create({
      data: {
        ...createStoreDto,
        tenantId
      }
    });
  }

  /**
   * Find all stores by tenant
   */
  async findAllByTenant(tenantId: string): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: {
        tenantId,
        deletedAt: null
      },
      orderBy: [
        { type: 'asc' }, // MAIN first, then BRANCH, then LEAFLET
        { name: 'asc' }
      ]
    });
  }

  /**
   * Find one store by ID
   */
  async findOne(id: string, tenantId: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null
      }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  /**
   * Update a store
   */
  async update(id: string, tenantId: string, updateStoreDto: UpdateStoreDto): Promise<Store> {
    // Verify store exists and belongs to tenant
    const existingStore = await this.findOne(id, tenantId);

    // Check if name is being changed and is unique
    if (updateStoreDto.name && updateStoreDto.name !== existingStore.name) {
      const nameConflict = await this.prisma.store.findFirst({
        where: {
          tenantId,
          name: updateStoreDto.name,
          id: { not: id }
        }
      });

      if (nameConflict) {
        throw new BadRequestException('Store name must be unique within tenant');
      }
    }

    // Prevent changing main store type if it would leave tenant without main store
    if (updateStoreDto.type && updateStoreDto.type !== 'MAIN' && existingStore.type === 'MAIN') {
      const otherMainStores = await this.prisma.store.count({
        where: {
          tenantId,
          type: 'MAIN',
          id: { not: id },
          deletedAt: null
        }
      });

      if (otherMainStores === 0) {
        throw new BadRequestException('Cannot change main store type - tenant must have at least one main store');
      }
    }

    // If setting as main store, ensure no other main store exists
    if (updateStoreDto.type === 'MAIN' && existingStore.type !== 'MAIN') {
      const existingMainStore = await this.prisma.store.findFirst({
        where: {
          tenantId,
          type: 'MAIN',
          id: { not: id }
        }
      });

      if (existingMainStore) {
        throw new BadRequestException('Tenant already has a main store');
      }
    }

    return this.prisma.store.update({
      where: { id },
      data: updateStoreDto
    });
  }

  /**
   * Remove a store (soft delete)
   */
  async remove(id: string, tenantId: string): Promise<void> {
    const store = await this.findOne(id, tenantId);

    // Prevent deletion of main store if it's the only one
    if (store.type === 'MAIN') {
      const otherStores = await this.prisma.store.count({
        where: {
          tenantId,
          id: { not: id },
          deletedAt: null
        }
      });

      if (otherStores === 0) {
        throw new BadRequestException('Cannot delete the only store in tenant');
      }

      // Check if there are other main stores
      const otherMainStores = await this.prisma.store.count({
        where: {
          tenantId,
          type: 'MAIN',
          id: { not: id },
          deletedAt: null
        }
      });

      if (otherMainStores === 0) {
        throw new BadRequestException('Cannot delete main store - tenant must have at least one main store');
      }
    }

    await this.prisma.store.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  /**
   * Find main store for a tenant
   */
  async findMainStore(tenantId: string): Promise<Store> {
    const mainStore = await this.prisma.store.findFirst({
      where: {
        tenantId,
        type: 'MAIN',
        deletedAt: null
      }
    });

    if (!mainStore) {
      throw new NotFoundException('Main store not found for tenant');
    }

    return mainStore;
  }

  /**
   * Create main store for a tenant (used during tenant creation)
   */
  async createMainStore(tenantId: string, tenantData: any): Promise<Store> {
    // Check if main store already exists
    const existingMainStore = await this.prisma.store.findFirst({
      where: {
        tenantId,
        isMain: true
      }
    });

    if (existingMainStore) {
      throw new BadRequestException('Main store already exists for this tenant');
    }

    return this.prisma.store.create({
      data: {
        name: `${tenantData.companyName} Main Store`,
        tenantId,
        type: 'MAIN',
        phone: tenantData.phone,
        email: tenantData.email,
        isActive: true
      }
    });
  }

  /**
   * Assign user to a store within a tenant context
   */
  async assignUserToStore(userId: string, storeId: string, tenantId?: string): Promise<any> {
    const contextTenantId = tenantId || this.tenantContext.requireTenantId();

    // Verify store exists and belongs to the tenant
    const store = await this.prisma.store.findFirst({
      where: { 
        id: storeId, 
        tenantId: contextTenantId,
        deletedAt: null 
      }
    });

    if (!store) {
      throw new NotFoundException('Store not found in this tenant');
    }

    // Find the UserTenant relationship
    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId: contextTenantId
      }
    });

    if (!userTenant) {
      throw new NotFoundException('User is not associated with this tenant');
    }

    // Update the UserTenant with store assignment
    return this.prisma.userTenant.update({
      where: { id: userTenant.id },
      data: { assignedStoreId: storeId },
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true
          }
        },
        assignedStore: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  /**
   * Get user's assigned store for a specific tenant
   */
  async getUserStore(userId: string, tenantId?: string): Promise<Store | null> {
    const contextTenantId = tenantId || this.tenantContext.requireTenantId();

    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId: contextTenantId
      },
      include: {
        assignedStore: true
      }
    });

    if (!userTenant) {
      return null;
    }

    return userTenant.assignedStore;
  }

  /**
   * Get all users assigned to a store
   */
  async getStoreUsers(storeId: string): Promise<any[]> {
    const tenantId = this.tenantContext.requireTenantId();

    // Verify store exists
    const store = await this.prisma.store.findFirst({
      where: { 
        id: storeId,
        tenantId,
        deletedAt: null 
      }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const userTenants = await this.prisma.userTenant.findMany({
      where: {
        assignedStoreId: storeId,
        tenantId
      },
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            username: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true
          }
        },
        assignedStore: {
          select: {
            id: true,
            name: true
          }
        },
        role: {
          select: {
            id: true,
            role: true
          }
        }
      }
    });

    return userTenants.map(ut => ({
      ...ut.user,
      assignedStore: ut.assignedStore,
      role: ut.role,
      userTenantId: ut.id
    }));
  }

  /**
   * Get user's default store (fallback for middleware)
   */
  async getUserDefaultStore(userId: string, tenantId?: string): Promise<string | null> {
    // If no tenant specified, try to get from context
    let contextTenantId = tenantId;
    if (!contextTenantId) {
      contextTenantId = this.tenantContext.getTenantId();
    }

    if (!contextTenantId) {
      return null;
    }

    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId: contextTenantId
      },
      include: {
        assignedStore: true,
        tenant: {
          include: {
            stores: {
              where: { type: 'MAIN', deletedAt: null },
              take: 1
            }
          }
        }
      }
    });

    if (!userTenant) {
      return null;
    }

    // Return assigned store if exists
    if (userTenant.assignedStore) {
      return userTenant.assignedStore.id;
    }

    // Fallback to main store of the tenant
    if (userTenant.tenant.stores.length > 0) {
      return userTenant.tenant.stores[0].id;
    }

    return null;
  }

  /**
   * Allocate inventory batch to a store
   */
  async allocateBatchToStore(batchId: string, storeId: string, quantity: number): Promise<StoreBatchAllocation> {
    // Verify store exists
    const store = await this.prisma.store.findUnique({
      where: { id: storeId }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify batch exists and has sufficient quantity
    const batch = await this.prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      include: {
        storeAllocations: true
      }
    });

    if (!batch) {
      throw new NotFoundException('Inventory batch not found');
    }

    // Check if batch belongs to the same tenant as the store
    if (batch.tenantId !== store.tenantId) {
      throw new ForbiddenException('Batch and store must belong to the same tenant');
    }

    // Calculate currently allocated quantity
    const currentlyAllocated = batch.storeAllocations.reduce(
      (sum, allocation) => sum + allocation.allocatedQuantity, 
      0
    );

    // Check if there's sufficient quantity available
    const availableQuantity = batch.remainingQuantity - currentlyAllocated;
    if (quantity > availableQuantity) {
      throw new BadRequestException(
        `Insufficient quantity available. Requested: ${quantity}, Available: ${availableQuantity}`
      );
    }

    // Check if allocation already exists for this batch-store combination
    const existingAllocation = await this.prisma.storeBatchAllocation.findUnique({
      where: {
        batchId_storeId: {
          batchId,
          storeId
        }
      }
    });

    if (existingAllocation) {
      // Update existing allocation
      return this.prisma.storeBatchAllocation.update({
        where: { id: existingAllocation.id },
        data: {
          allocatedQuantity: existingAllocation.allocatedQuantity + quantity,
          remainingQuantity: existingAllocation.remainingQuantity + quantity
        },
        include: {
          batch: true,
          store: true
        }
      });
    } else {
      // Create new allocation
      return this.prisma.storeBatchAllocation.create({
        data: {
          batchId,
          storeId,
          allocatedQuantity: quantity,
          remainingQuantity: quantity
        },
        include: {
          batch: true,
          store: true
        }
      });
    }
  }

  /**
   * Get all batch allocations for a store
   */
  async getStoreBatchAllocations(storeId: string): Promise<StoreBatchAllocation[]> {
    // Verify store exists
    const store = await this.prisma.store.findUnique({
      where: { id: storeId }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return this.prisma.storeBatchAllocation.findMany({
      where: { storeId },
      include: {
        batch: {
          include: {
            inventory: {
              select: {
                id: true,
                name: true,
                sku: true,
                image: true
              }
            }
          }
        },
        store: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Transfer batch allocation between stores
   */
  async transferBatchAllocation(fromStoreId: string, toStoreId: string, batchId: string, quantity: number): Promise<void> {
    // Verify both stores exist and belong to same tenant
    const [fromStore, toStore] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: fromStoreId } }),
      this.prisma.store.findUnique({ where: { id: toStoreId } })
    ]);

    if (!fromStore || !toStore) {
      throw new NotFoundException('One or both stores not found');
    }

    if (fromStore.tenantId !== toStore.tenantId) {
      throw new BadRequestException('Stores must belong to the same tenant');
    }

    // Verify source allocation exists and has sufficient quantity
    const sourceAllocation = await this.prisma.storeBatchAllocation.findUnique({
      where: {
        batchId_storeId: {
          batchId,
          storeId: fromStoreId
        }
      }
    });

    if (!sourceAllocation) {
      throw new NotFoundException('Source batch allocation not found');
    }

    if (sourceAllocation.remainingQuantity < quantity) {
      throw new BadRequestException(
        `Insufficient quantity in source store. Requested: ${quantity}, Available: ${sourceAllocation.remainingQuantity}`
      );
    }

    // Use transaction to ensure consistency
    await this.prisma.$transaction(async (tx) => {
      // Reduce quantity from source store
      await tx.storeBatchAllocation.update({
        where: { id: sourceAllocation.id },
        data: {
          allocatedQuantity: sourceAllocation.allocatedQuantity - quantity,
          remainingQuantity: sourceAllocation.remainingQuantity - quantity
        }
      });

      // Check if destination allocation exists
      const destinationAllocation = await tx.storeBatchAllocation.findUnique({
        where: {
          batchId_storeId: {
            batchId,
            storeId: toStoreId
          }
        }
      });

      if (destinationAllocation) {
        // Update existing destination allocation
        await tx.storeBatchAllocation.update({
          where: { id: destinationAllocation.id },
          data: {
            allocatedQuantity: destinationAllocation.allocatedQuantity + quantity,
            remainingQuantity: destinationAllocation.remainingQuantity + quantity
          }
        });
      } else {
        // Create new destination allocation
        await tx.storeBatchAllocation.create({
          data: {
            batchId,
            storeId: toStoreId,
            allocatedQuantity: quantity,
            remainingQuantity: quantity
          }
        });
      }

      // Remove source allocation if quantity becomes zero
      if (sourceAllocation.allocatedQuantity - quantity === 0) {
        await tx.storeBatchAllocation.delete({
          where: { id: sourceAllocation.id }
        });
      }
    });
  }
}