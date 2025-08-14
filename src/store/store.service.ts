import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { GetStoresDto } from './dto/get-stores.dto';
import { GetUsersDto } from './dto/get-users.dto';
import { Store, StoreClass } from '@prisma/client';
import { TenantContext } from '../tenants/context/tenant.context';
import { PaginatedResult } from '../utils/dto/pagination.dto';
import {
  createPaginatedResponse,
  createPrismaQueryOptions,
} from '../utils/helpers.util';

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
    console.log('[DEBUG] Using tenant ID:', tenantId);
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
        deletedAt: { equals: null },
        // deletedAt:null,
      },
    });

    if (existingStore) {
      throw new BadRequestException('Store name must be unique within tenant');
    }

    // If this is marked as main store, ensure no other main store exists
    if (createStoreDto.classification === StoreClass.MAIN) {
      const existingMainStore = await this.prisma.store.findFirst({
        where: {
          tenantId,
          classification: StoreClass.MAIN,
        },
      });

      if (existingMainStore) {
        throw new BadRequestException('Tenant already has a main store');
      }
    }

    return this.prisma.store.create({
      data: {
        ...createStoreDto,
        tenant: {
          connect: { id: tenantId },
        },
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
        deletedAt: { equals: null },
        // deletedAt: null,
      },
      orderBy: [
        { classification: 'asc' }, // MAIN first, then BRANCH, then OUTLET
        { name: 'asc' },
      ],
    });
  }

  /**
   * Find all stores by tenant with pagination, search, and filtering
   */
  async findAllByTenantPaginated(
    query: GetStoresDto,
  ): Promise<PaginatedResult<Store>> {
    const tenantId = this.tenantContext.requireTenantId();

    // Build filter options with tenant filtering and soft delete exclusion
    const filterOptions = {
      tenantId,
      ...(query.classification && { classification: query.classification }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.createdAt && { createdAt: { gte: new Date(query.createdAt) } }),
      ...(query.updatedAt && { updatedAt: { gte: new Date(query.updatedAt) } }),
    };

    // Define searchable fields for store search
    const searchFields = ['name', 'description', 'address', 'phone', 'email'];

    // Create Prisma query options using existing utility
    const queryOptions = createPrismaQueryOptions(
      query,
      searchFields,
      filterOptions,
    );

    // Execute parallel count and data queries for optimal performance
    const [stores, total] = await Promise.all([
      this.prisma.store.findMany(queryOptions),
      this.prisma.store.count({ where: queryOptions.where }),
    ]);

    // Return results using createPaginatedResponse utility function
    return createPaginatedResponse(stores, total, query);
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
        // deletedAt: { equals: null }
        // deletedAt: null,
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
      updateStoreDto.classification !== StoreClass.MAIN &&
      existingStore.classification === StoreClass.MAIN
    ) {
      const otherMainStores = await this.prisma.store.count({
        where: {
          tenantId,
          classification: StoreClass.MAIN,
          id: { not: id },
          // deletedAt: { equals: null }
          // deletedAt: null,
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
      updateStoreDto.classification === StoreClass.MAIN &&
      existingStore.classification !== StoreClass.MAIN
    ) {
      const existingMainStore = await this.prisma.store.findFirst({
        where: {
          tenantId,
          classification: StoreClass.MAIN,
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
    if (store.classification === StoreClass.MAIN) {
      const otherStores = await this.prisma.store.count({
        where: {
          tenantId,
          id: { not: id },
          // deletedAt: { equals: null }
          // deletedAt: null,
        },
      });

      if (otherStores === 0) {
        throw new BadRequestException('Cannot delete the only store in tenant');
      }

      // Check if there are other main stores
      const otherMainStores = await this.prisma.store.count({
        where: {
          tenantId,
          classification: StoreClass.MAIN,
          id: { not: id },
          // deletedAt: null,
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
        classification: StoreClass.MAIN,
        deletedAt: { equals: null },
        // deletedAt: null,
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
        // deletedAt: { equals: null }
        // deletedAt: null,
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
   * Get all users assigned to a store with pagination
   */
  async getStoreUsers(
    storeId: string,
    query: GetUsersDto,
  ): Promise<PaginatedResult<any>> {
    const tenantId = this.tenantContext.requireTenantId();

    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    const where: any = {
      assignedStoreId: storeId,
      tenantId,
    };

    if (query.isActive !== undefined) {
      where.user = { status: query.isActive ? 'ACTIVE' : 'INACTIVE' };
    }

    if (query.search) {
      where.OR = [
        {
          user: { firstname: { contains: query.search, mode: 'insensitive' } },
        },
        { user: { lastname: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { user: { username: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: any = {};
    if (query.sortBy) {
      if (query.sortBy.startsWith('user.')) {
        orderBy.user = {
          [query.sortBy.replace('user.', '')]: query.sortOrder || 'desc',
        };
      } else {
        orderBy[query.sortBy] = query.sortOrder || 'desc';
      }
    } else {
      orderBy.user = { createdAt: 'desc' };
    }

    const [userTenants, total] = await Promise.all([
      this.prisma.userTenant.findMany({
        where,
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
        orderBy,
        skip: ((query.page || 1) - 1) * (query.limit || 10),
        take: query.limit || 10,
      }),
      this.prisma.userTenant.count({ where }),
    ]);

    const users = userTenants.map((ut) => ({
      ...ut.user,
      assignedStore: ut.assignedStore,
      role: ut.role,
      userTenantId: ut.id,
    }));

    return createPaginatedResponse(users, total, query);
  }

  /**
   * Get unassigned users in tenant
   */
  // async getUnassignedUsers(query: GetUsersDto): Promise<PaginatedResult<any>> {
  //   const tenantId = this.tenantContext.requireTenantId();

  //   const where: any = {
  //     tenantId,
  //     // assignedStoreId: null,
  //     // assignedStoreId: { equals: null }
  //   };

  //   if (query.isActive !== undefined) {
  //     where.user = { status: query.isActive ? 'ACTIVE' : 'INACTIVE' };
  //   }

  //   if (query.search) {
  //     where.OR = [
  //       {
  //         user: { firstname: { contains: query.search, mode: 'insensitive' } },
  //       },
  //       { user: { lastname: { contains: query.search, mode: 'insensitive' } } },
  //       { user: { email: { contains: query.search, mode: 'insensitive' } } },
  //       { user: { username: { contains: query.search, mode: 'insensitive' } } },
  //     ];
  //   }

  //   const orderBy: any = {};
  //   if (query.sortBy) {
  //     if (query.sortBy.startsWith('user.')) {
  //       orderBy.user = {
  //         [query.sortBy.replace('user.', '')]: query.sortOrder || 'desc',
  //       };
  //     } else {
  //       orderBy[query.sortBy] = query.sortOrder || 'desc';
  //     }
  //   } else {
  //     orderBy.user = { createdAt: 'desc' };
  //   }

  //   const [userTenants, total] = await Promise.all([
  //     this.prisma.userTenant.findMany({
  //       where,
  //       include: {
  //         user: {
  //           select: {
  //             id: true,
  //             firstname: true,
  //             lastname: true,
  //             username: true,
  //             email: true,
  //             phone: true,
  //             status: true,
  //             createdAt: true,
  //           },
  //         },
  //         role: {
  //           select: {
  //             id: true,
  //             role: true,
  //           },
  //         },
  //       },
  //       orderBy,
  //       skip: ((query.page || 1) - 1) * (query.limit || 10),
  //       take: query.limit || 10,
  //     }),
  //     this.prisma.userTenant.count({ where }),
  //   ]);

  //   const users = userTenants.map((ut) => ({
  //     ...ut.user,
  //     role: ut.role,
  //     userTenantId: ut.id,
  //   }));

  //   return createPaginatedResponse(users, total, query);
  // }

  async getUnassignedUsers(
    // storeId: string,
    query: GetUsersDto,
  ): Promise<PaginatedResult<any>> {
    const tenantId = this.tenantContext.requireTenantId();

    const where: any = {
      // assignedStoreId: storeId,
      tenantId,
    };

    if (query.isActive !== undefined) {
      where.user = { status: query.isActive ? 'ACTIVE' : 'INACTIVE' };
    }

    if (query.search) {
      where.OR = [
        {
          user: { firstname: { contains: query.search, mode: 'insensitive' } },
        },
        { user: { lastname: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { user: { username: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const orderBy: any = {};
    if (query.sortBy) {
      if (query.sortBy.startsWith('user.')) {
        orderBy.user = {
          [query.sortBy.replace('user.', '')]: query.sortOrder || 'desc',
        };
      } else {
        orderBy[query.sortBy] = query.sortOrder || 'desc';
      }
    } else {
      orderBy.user = { createdAt: 'desc' };
    }

    const [userTenants, total] = await Promise.all([
      this.prisma.userTenant.findMany({
        where,
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
        orderBy,
        skip: ((query.page || 1) - 1) * (query.limit || 10),
        take: query.limit || 10,
      }),
      this.prisma.userTenant.count({ where }),
    ]);

    const users = userTenants.map((ut) => ({
      ...ut.user,
      assignedStore: ut.assignedStore,
      role: ut.role,
      userTenantId: ut.id,
    }));

    return createPaginatedResponse(users, total, query);
  }

  /**
   * Unassign user from store
   */
  async unassignUserFromStore(userId: string): Promise<any> {
    const tenantId = this.tenantContext.requireTenantId();

    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId, tenantId },
    });

    if (!userTenant) {
      throw new NotFoundException('User not found in tenant');
    }

    return this.prisma.userTenant.update({
      where: { id: userTenant.id },
      data: { assignedStoreId: null },
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    });
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
              where: { classification: StoreClass.MAIN },
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
