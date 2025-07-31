import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StoreType, TenantStoreType } from '@prisma/client';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto, StoreConfigurationDto } from './dto/update-store.dto';
import { StoreContext } from './context/store.context';
import { TenantContext } from '../tenants/context/tenant.context';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContext,
    private readonly tenantContext: TenantContext
  ) {}

  private readonly hierarchyMap: Record<StoreType, StoreType[]> = {
    [StoreType.MAIN]: [StoreType.REGIONAL],
    [StoreType.REGIONAL]: [StoreType.SUB_REGIONAL],
    [StoreType.SUB_REGIONAL]: [],
  };

  async createStore(dto: CreateStoreDto, userContext?: { tenantId?: string, storeId?: string }): Promise<any> {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const storeId = userContext?.storeId || this.storeContext.getStoreId();

    // const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // userId: string;
    // if (!user || user.role !== 'admin') {
    //   throw new ForbiddenException('Only admins can create warehouses');
    // }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.storeType === TenantStoreType.SINGLE_STORE) {
      const existingWarehouse = await this.prisma.store.findFirst({ where: { tenantId } });
      if (existingWarehouse) {
        throw new BadRequestException('Tenant with single store type already has a warehouse');
      }
    }

    let type: StoreType;
    if (!storeId) {
      type = StoreType.MAIN;
    } else {
      const parent = await this.prisma.store.findUnique({ where: { id: storeId } });
      if (!parent) {
        throw new NotFoundException('Parent warehouse not found');
      }

      const allowed = this.hierarchyMap[parent.type as StoreType];
      if (!allowed || allowed.length === 0) {
        throw new BadRequestException('This type of warehouse cannot create children');
      }

      type = allowed[0];
    }

    return this.prisma.store.create({
      data: {
        name: dto.name,
        type,
        parentId: storeId ?? undefined,
        tenantId,
      },
    });
  }

  async getStore(id: string, userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async listStores(userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    return this.prisma.store.findMany({
      where: { tenantId },
      include: {
        parent: true,
        children: true,
        users: {
          include: {
            user: { select: { firstname: true, lastname: true, email: true } },
            role: true
          }
        },
        configuration: true,
        _count: {
          select: {
            storeInventories: true,
            transfersFrom: true,
            transfersTo: true
          }
        }
      },
      orderBy: [
        { type: 'asc' }, // Main stores first
        { createdAt: 'asc' }
      ]
    });
  }

  async updateStore(
    id: string, 
    dto: UpdateStoreDto, 
    userContext?: { tenantId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId }
    });
    
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return this.prisma.store.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.region && { region: dto.region })
      },
      include: {
        parent: true,
        children: true,
        configuration: true
      }
    });
  }

  async deleteStore(id: string, userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId },
      include: { children: true, storeInventories: true }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Cannot delete main store
    if (store.type === StoreType.MAIN) {
      throw new BadRequestException('Cannot delete main store');
    }

    // Cannot delete store with children
    if (store.children.length > 0) {
      throw new BadRequestException('Cannot delete store with child stores. Delete child stores first.');
    }

    // Cannot delete store with inventory
    if (store.storeInventories.length > 0) {
      throw new BadRequestException('Cannot delete store with inventory. Transfer inventory first.');
    }

    await this.prisma.store.delete({ where: { id } });
    return { message: 'Store deleted successfully' };
  }

  async getStoreConfiguration(
    storeId: string, 
    userContext?: { tenantId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
      include: { configuration: true }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    return store.configuration;
  }

  async updateStoreConfiguration(
    storeId: string,
    dto: StoreConfigurationDto,
    userContext?: { tenantId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Check if configuration exists
    const existingConfig = await this.prisma.storeConfiguration.findFirst({
      where: { storeId }
    });

    if (existingConfig) {
      return this.prisma.storeConfiguration.update({
        where: { id: existingConfig.id },
        data: {
          ...dto,
          coordinates: dto.city && dto.state ? { 
            address: dto.address,
            city: dto.city,
            state: dto.state,
            country: dto.country 
          } : undefined
        }
      });
    } else {
      return this.prisma.storeConfiguration.create({
        data: {
          storeId,
          tenantId,
          ...dto,
          coordinates: dto.city && dto.state ? { 
            address: dto.address,
            city: dto.city,
            state: dto.state,
            country: dto.country 
          } : undefined
        }
      });
    }
  }

  async getStoreHierarchy(userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const stores = await this.prisma.store.findMany({
      where: { tenantId, isActive: true },
      include: {
        parent: true,
        children: {
          include: {
            children: true, // Include sub-regional stores
            _count: { select: { storeInventories: true } }
          }
        },
        _count: { select: { storeInventories: true } }
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }]
    });

    // Build hierarchical structure
    const hierarchy = stores
      .filter(store => store.type === StoreType.MAIN)
      .map(mainStore => ({
        ...mainStore,
        children: mainStore.children.map(regionalStore => ({
          ...regionalStore,
          children: regionalStore.children
        }))
      }));

    return hierarchy;
  }

  async getStoreStats(userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    const [
      totalStores,
      activeStores,
      storesByType,
      totalInventoryItems,
      activeTransfers
    ] = await Promise.all([
      this.prisma.store.count({ where: { tenantId } }),
      this.prisma.store.count({ where: { tenantId, isActive: true } }),
      this.prisma.store.groupBy({
        by: ['type'],
        where: { tenantId },
        _count: { type: true }
      }),
      this.prisma.storeInventory.count({ where: { tenantId } }),
      this.prisma.storeTransfer.count({
        where: { 
          tenantId, 
          status: { in: ['PENDING', 'APPROVED', 'IN_TRANSIT'] }
        }
      })
    ]);

    return {
      totalStores,
      activeStores,
      storesByType: storesByType.reduce((acc, item) => {
        acc[item.type] = item._count.type;
        return acc;
      }, {} as Record<string, number>),
      totalInventoryItems,
      activeTransfers
    };
  }
}
