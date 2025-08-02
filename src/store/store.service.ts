import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Store } from '@prisma/client';
import { TenantContext } from 'src/tenants/context/tenant.context';

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Create a new store
   */

  async createStore(createStoreDto: CreateStoreDto): Promise<Store> {
    const tenantId = this.tenantContext.requireTenantId();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Check if tenant allows multiple stores
    if (tenant.storeType === 'SINGLE_STORE') {
      throw new BadRequestException('Tenant does not allow multiple stores');
    }

    // Check if store name is unique within tenant
    const existingStore = await this.prisma.store.findFirst({
      where: {
        tenantId,
        name: createStoreDto.name,
      },
    });

    if (existingStore) {
      throw new BadRequestException('Store name must be unique within tenant');
    }

    // If this is marked as main store, ensure no other main store exists
    if (createStoreDto.classification === 'MAIN') {
      const existingMainStore = await this.prisma.store.findFirst({
        where: {
          tenantId,
          classification: 'MAIN',
        },
      });

      if (existingMainStore) {
        throw new BadRequestException('Tenant already has a main store');
      }
    }

    return this.prisma.store.create({
      data: {
        ...createStoreDto,
        tenantId,
      },
    });
  }

  /**
   * Find all stores by tenant
   */
  async findAllByTenant(): Promise<Store[]> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.prisma.store.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [
        { classification: 'asc' }, // MAIN first, then BRANCH, then LEAFLET
        { name: 'asc' },
      ],
    });
  }

  /**
   * Find one store by ID
   */
  async findOne(id: string): Promise<Store> {
    const tenantId = this.tenantContext.requireTenantId();
    const store = await this.prisma.store.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store;
  }

  /**
   * Update a store
   */
  async update(id: string, updateStoreDto: UpdateStoreDto): Promise<Store> {
    const tenantId = this.tenantContext.requireTenantId();
    // Verify store exists and belongs to tenant
    const existingStore = await this.findOne(id);

    // Check if name is being changed and is unique
    if (updateStoreDto.name && updateStoreDto.name !== existingStore.name) {
      const nameConflict = await this.prisma.store.findFirst({
        where: {
          tenantId,
          name: updateStoreDto.name,
          id: { not: id },
        },
      });

      if (nameConflict) {
        throw new BadRequestException(
          'Store name must be unique within tenant',
        );
      }
    }

    // Prevent changing main store type if it would leave tenant without main store
    if (
      updateStoreDto.classification &&
      updateStoreDto.classification !== 'MAIN' &&
      existingStore.classification === 'MAIN'
    ) {
      const otherMainStores = await this.prisma.store.count({
        where: {
          tenantId,
          classification: 'MAIN',
          id: { not: id },
          deletedAt: null,
        },
      });

      if (otherMainStores === 0) {
        throw new BadRequestException(
          'Cannot change main store type - tenant must have at least one main store',
        );
      }
    }

    // If setting as main store, ensure no other main store exists
    if (
      updateStoreDto.classification === 'MAIN' &&
      existingStore.classification !== 'MAIN'
    ) {
      const existingMainStore = await this.prisma.store.findFirst({
        where: {
          tenantId,
          classification: 'MAIN',
          id: { not: id },
        },
      });

      if (existingMainStore) {
        throw new BadRequestException('Tenant already has a main store');
      }
    }

    return this.prisma.store.update({
      where: { id },
      data: updateStoreDto,
    });
  }

  /**
   * Remove a store (soft delete)
   */
  async remove(id: string): Promise<void> {
    const tenantId = this.tenantContext.requireTenantId();
    const store = await this.findOne(id);

    // Prevent deletion of main store if it's the only one
    if (store.classification === 'MAIN') {
      const otherStores = await this.prisma.store.count({
        where: {
          tenantId,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (otherStores === 0) {
        throw new BadRequestException('Cannot delete the only store in tenant');
      }

      // Check if there are other main stores
      const otherMainStores = await this.prisma.store.count({
        where: {
          tenantId,
          classification: 'MAIN',
          id: { not: id },
          deletedAt: null,
        },
      });

      if (otherMainStores === 0) {
        throw new BadRequestException(
          'Cannot delete main store - tenant must have at least one main store',
        );
      }
    }

    await this.prisma.store.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Find main store for a tenant
   */
  async findMainStore(): Promise<Store> {
    const tenantId = this.tenantContext.requireTenantId();
    const mainStore = await this.prisma.store.findFirst({
      where: {
        tenantId,
        classification: 'MAIN',
        deletedAt: null,
      },
    });

    if (!mainStore) {
      throw new NotFoundException('Main store not found for tenant');
    }

    return mainStore;
  }

  /**
   * Assign user to a store within a tenant context
   */
  async assignUserToStore(userId: string, storeId: string): Promise<any> {
    const contextTenantId = this.tenantContext.requireTenantId();

    // Verify store exists and belongs to the tenant
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        tenantId: contextTenantId,
        deletedAt: null,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found in this tenant');
    }

    // Find the UserTenant relationship
    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId: contextTenantId,
      },
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
            email: true,
          },
        },
        assignedStore: {
          select: {
            id: true,
            name: true,
          },
        },
      },
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
        tenantId: contextTenantId,
      },
      include: {
        assignedStore: true,
      },
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
        deletedAt: null,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const userTenants = await this.prisma.userTenant.findMany({
      where: {
        assignedStoreId: storeId,
        tenantId,
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
            createdAt: true,
          },
        },
        assignedStore: {
          select: {
            id: true,
            name: true,
          },
        },
        role: {
          select: {
            id: true,
            role: true,
          },
        },
      },
    });

    return userTenants.map((ut) => ({
      ...ut.user,
      assignedStore: ut.assignedStore,
      role: ut.role,
      userTenantId: ut.id,
    }));
  }

  /**
   * Get user's default store (fallback for middleware)
   */
  async getUserDefaultStore(
    userId: string,
    tenantId?: string,
  ): Promise<string | null> {
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
        tenantId: contextTenantId,
      },
      include: {
        assignedStore: true,
        tenant: {
          include: {
            stores: {
              where: { classification: 'MAIN', deletedAt: null },
              take: 1,
            },
          },
        },
      },
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

  async userHasStoreAccess(userId: string, storeId: string): Promise<boolean> {
    const tenantId = this.tenantContext.requireTenantId();

    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId,
        assignedStoreId: storeId,
      },
    });

    return !!userTenant;
  }

  // For services that need store filtering, use this helper
  async getStoreFilterForUser(
    userId: string,
  ): Promise<{ storeId: string } | unknown> {
    const userStore = await this.getCurrentUserStore(userId);

    // Return store filter if user has assigned store, otherwise return empty filter
    return userStore ? { storeId: userStore.id } : {};
  }

  // Get user's assigned store within current tenant context
  async getCurrentUserStore(userId: string): Promise<any> {
    const tenantId = this.tenantContext.requireTenantId();

    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId,
      },
      include: {
        assignedStore: true,
      },
    });

    if (!userTenant) {
      throw new BadRequestException('User not found in current tenant');
    }

    return userTenant.assignedStore;
  }

  // Get store by ID with tenant validation
  async getStoreById(storeId: string): Promise<any> {
    const tenantId = this.tenantContext.requireTenantId();

    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        tenantId,
      },
    });

    if (!store) {
      throw new BadRequestException('Store not found or access denied');
    }

    return store;
  }
}
