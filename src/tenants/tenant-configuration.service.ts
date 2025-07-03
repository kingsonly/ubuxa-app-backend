import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantStoreType, StoreType } from '@prisma/client';

export interface MultiStoreConfigurationDto {
  enableMultiStore: boolean;
  mainStoreName?: string;
  autoCreateMainStore?: boolean;
}

export interface TenantMultiStoreStatus {
  isMultiStoreEnabled: boolean;
  storeType: TenantStoreType;
  totalStores: number;
  mainStore?: {
    id: string;
    name: string;
    createdAt: Date;
  };
  canEnableMultiStore: boolean;
  canDisableMultiStore: boolean;
}

@Injectable()
export class TenantConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  async getMultiStoreStatus(tenantId: string): Promise<TenantMultiStoreStatus> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        stores: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const mainStore = tenant.stores.find(store => store.type === StoreType.MAIN);
    const totalStores = tenant.stores.length;

    return {
      isMultiStoreEnabled: tenant.storeType === TenantStoreType.MULTI_STORE,
      storeType: tenant.storeType,
      totalStores,
      mainStore: mainStore ? {
        id: mainStore.id,
        name: mainStore.name,
        createdAt: mainStore.createdAt
      } : undefined,
      canEnableMultiStore: tenant.storeType === TenantStoreType.SINGLE_STORE,
      canDisableMultiStore: tenant.storeType === TenantStoreType.MULTI_STORE && totalStores <= 1
    };
  }

  async enableMultiStore(
    tenantId: string, 
    config: MultiStoreConfigurationDto,
    userId: string
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { stores: true }
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.storeType === TenantStoreType.MULTI_STORE) {
      throw new BadRequestException('Multi-store is already enabled for this tenant');
    }

    // Use transaction to ensure atomicity
    return this.prisma.$transaction(async (tx) => {
      // Update tenant to multi-store type
      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { storeType: TenantStoreType.MULTI_STORE }
      });

      let mainStore;

      // Handle existing store
      if (tenant.stores.length > 0) {
        // Convert existing store to main store
        const existingStore = tenant.stores[0];
        mainStore = await tx.store.update({
          where: { id: existingStore.id },
          data: { 
            type: StoreType.MAIN,
            name: config.mainStoreName || existingStore.name || 'Main Store'
          }
        });
      } else if (config.autoCreateMainStore || config.mainStoreName) {
        // Create main store
        mainStore = await tx.store.create({
          data: {
            name: config.mainStoreName || 'Main Store',
            type: StoreType.MAIN,
            tenantId,
            isActive: true
          }
        });

        // Create default store configuration
        await tx.storeConfiguration.create({
          data: {
            storeId: mainStore.id,
            tenantId,
            allowDirectTransfers: true,
            autoApproveToChildren: true,
            autoApproveFromParent: false
          }
        });
      }

      return {
        tenant: updatedTenant,
        mainStore,
        message: 'Multi-store functionality enabled successfully'
      };
    });
  }

  async disableMultiStore(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { 
        stores: true,
        storeInventories: true,
        storeTransfers: { where: { status: { in: ['PENDING', 'APPROVED', 'IN_TRANSIT'] } } }
      }
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.storeType === TenantStoreType.SINGLE_STORE) {
      throw new BadRequestException('Multi-store is already disabled for this tenant');
    }

    // Validation checks
    if (tenant.stores.length > 1) {
      throw new BadRequestException(
        'Cannot disable multi-store with multiple stores. Please consolidate to a single store first.'
      );
    }

    if (tenant.storeTransfers.length > 0) {
      throw new BadRequestException(
        'Cannot disable multi-store with active transfers. Please complete all transfers first.'
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Update tenant to single store type
      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { storeType: TenantStoreType.SINGLE_STORE }
      });

      // If there's a store, remove type designation
      if (tenant.stores.length === 1) {
        await tx.store.update({
          where: { id: tenant.stores[0].id },
          data: { type: StoreType.MAIN } // Keep as MAIN but in single-store context
        });
      }

      return {
        tenant: updatedTenant,
        message: 'Multi-store functionality disabled successfully'
      };
    });
  }

  async getStoreConfiguration(storeId: string, tenantId: string) {
    const storeConfig = await this.prisma.storeConfiguration.findFirst({
      where: { storeId, tenantId },
      include: { store: true }
    });

    if (!storeConfig) {
      // Return default configuration if none exists
      const store = await this.prisma.store.findFirst({
        where: { id: storeId, tenantId }
      });

      if (!store) {
        throw new NotFoundException('Store not found');
      }

      return {
        storeId,
        allowDirectTransfers: true,
        requireApprovalFor: null,
        autoApproveFromParent: false,
        autoApproveToChildren: store.type === StoreType.MAIN,
        address: null,
        city: null,
        state: null,
        country: null,
        managerName: null,
        managerEmail: null,
        managerPhone: null,
        store
      };
    }

    return storeConfig;
  }

  async validateMultiStoreOperation(tenantId: string, operation: string) {
    const status = await this.getMultiStoreStatus(tenantId);

    if (!status.isMultiStoreEnabled) {
      throw new BadRequestException(
        `Cannot perform ${operation}: Multi-store functionality is not enabled for this tenant`
      );
    }

    return status;
  }

  async getAvailableStoreTypes(tenantId: string, parentStoreId?: string) {
    const status = await this.getMultiStoreStatus(tenantId);

    if (!status.isMultiStoreEnabled) {
      return [StoreType.MAIN];
    }

    if (!parentStoreId) {
      // Creating root level store
      return status.mainStore ? [StoreType.REGIONAL] : [StoreType.MAIN];
    }

    // Get parent store to determine allowed child types
    const parentStore = await this.prisma.store.findFirst({
      where: { id: parentStoreId, tenantId }
    });

    if (!parentStore) {
      throw new NotFoundException('Parent store not found');
    }

    switch (parentStore.type) {
      case StoreType.MAIN:
        return [StoreType.REGIONAL];
      case StoreType.REGIONAL:
        return [StoreType.SUB_REGIONAL];
      case StoreType.SUB_REGIONAL:
        return []; // Sub-regional stores cannot have children
      default:
        return [];
    }
  }

  async getStoreHierarchyLimits(tenantId: string) {
    const status = await this.getMultiStoreStatus(tenantId);

    return {
      isMultiStoreEnabled: status.isMultiStoreEnabled,
      maxDepth: 3, // Main -> Regional -> Sub-Regional
      maxStoresPerLevel: {
        [StoreType.MAIN]: 1,
        [StoreType.REGIONAL]: 10, // Configurable per tenant
        [StoreType.SUB_REGIONAL]: 50 // Configurable per tenant
      },
      currentCounts: {
        [StoreType.MAIN]: status.mainStore ? 1 : 0,
        [StoreType.REGIONAL]: 0, // Will be calculated if needed
        [StoreType.SUB_REGIONAL]: 0 // Will be calculated if needed
      }
    };
  }
}