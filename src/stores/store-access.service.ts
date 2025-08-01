import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreContext } from './context/store.context';
import { TenantContext } from '../tenants/context/tenant.context';

export interface AssignUserToStoreDto {
  userId: string;
  storeId: string;
  roleId: string;
}

export interface UserStoreAccessDto {
  userId: string;
  storeId?: string;
}

@Injectable()
export class StoreAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContext,
    private readonly tenantContext: TenantContext
  ) {}

  /**
   * Create default store permissions when a tenant is created
   */
  async createDefaultStorePermissions(tenantId: string) {
    const storePermissions = [
      // Store management
      { action: 'manage', subject: 'Store' },
      { action: 'read', subject: 'Store' },
      { action: 'configure', subject: 'StoreConfiguration' },
      
      // Inventory management
      { action: 'manage', subject: 'StoreInventory' },
      { action: 'read', subject: 'StoreInventory' },
      { action: 'allocate', subject: 'StoreInventory' },
      { action: 'adjust', subject: 'StoreInventory' },
      
      // Transfer management
      { action: 'manage', subject: 'StoreTransfer' },
      { action: 'transfer', subject: 'StoreTransfer' },
      { action: 'receive', subject: 'StoreTransfer' },
      { action: 'approve', subject: 'StoreTransfer' },
      
      // Reports
      { action: 'read', subject: 'Reports' },
      { action: 'export', subject: 'Reports' },
    ];

    const createdPermissions = [];
    
    for (const perm of storePermissions) {
      const existing = await this.prisma.permission.findFirst({
        where: {
          action: perm.action as any,
          subject: perm.subject as any,
          storeId: null // Tenant-wide store permissions
        }
      });

      if (!existing) {
        const created = await this.prisma.permission.create({
          data: {
            action: perm.action as any,
            subject: perm.subject as any,
            storeId: null // Tenant-wide
          }
        });
        createdPermissions.push(created);
      } else {
        createdPermissions.push(existing);
      }
    }

    return createdPermissions;
  }

  /**
   * Create a "Store Admin" role with all store permissions
   */
  async createStoreAdminRole(tenantId: string, createdBy?: string) {
    // Get all store permissions
    const storePermissions = await this.prisma.permission.findMany({
      where: {
        subject: {
          in: ['Store', 'StoreConfiguration', 'StoreInventory', 'StoreTransfer', 'Reports']
        }
      }
    });

    // Create Store Admin role
    const storeAdminRole = await this.prisma.role.create({
      data: {
        role: 'Store Admin',
        tenantId,
        created_by: createdBy,
        permissionIds: storePermissions.map(p => p.id)
      },
      include: {
        permissions: true
      }
    });

    return storeAdminRole;
  }

  /**
   * Assign a user to a store with a specific role
   */
  async assignUserToStore(dto: AssignUserToStoreDto, userContext?: { tenantId?: string, userId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    // Verify user, store, and role exist
    const [user, store, role] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: dto.userId } }),
      this.prisma.store.findFirst({ where: { id: dto.storeId, tenantId } }),
      this.prisma.role.findFirst({ where: { id: dto.roleId, tenantId } })
    ]);

    if (!user || !store || !role) {
      throw new NotFoundException('User, store, or role not found');
    }

    // Check if assignment already exists
    const existing = await this.prisma.userStoreAccess.findFirst({
      where: {
        userId: dto.userId,
        storeId: dto.storeId,
        tenantId
      }
    });

    if (existing) {
      // Update existing assignment
      return await this.prisma.userStoreAccess.update({
        where: { id: existing.id },
        data: {
          roleId: dto.roleId,
          isActive: true,
          assignedBy: userContext?.userId,
          assignedAt: new Date(),
          revokedAt: null
        },
        include: {
          user: true,
          store: true,
          role: {
            include: {
              permissions: true
            }
          }
        }
      });
    }

    // Create new assignment
    return await this.prisma.userStoreAccess.create({
      data: {
        userId: dto.userId,
        storeId: dto.storeId,
        roleId: dto.roleId,
        tenantId,
        assignedBy: userContext?.userId
      },
      include: {
        user: true,
        store: true,
        role: {
          include: {
            permissions: true
          }
        }
      }
    });
  }

  /**
   * Get user's store access and permissions
   */
  async getUserStoreAccess(dto: UserStoreAccessDto, userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    const where: any = {
      userId: dto.userId,
      tenantId,
      isActive: true
    };

    if (dto.storeId) {
      where.storeId = dto.storeId;
    }

    const storeAccess = await this.prisma.userStoreAccess.findMany({
      where,
      include: {
        store: true,
        role: {
          include: {
            permissions: {
              where: {
                OR: [
                  { storeId: null }, // Tenant-wide permissions
                  { storeId: dto.storeId } // Store-specific permissions
                ]
              }
            }
          }
        }
      }
    });

    return storeAccess;
  }

  /**
   * Check if user has specific permission for a store
   */
  async checkUserStorePermission(
    userId: string,
    storeId: string,
    action: string,
    subject: string,
    userContext?: { tenantId?: string }
  ): Promise<boolean> {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    // Check if user is tenant super admin
    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId, tenantId },
      include: {
        role: {
          include: {
            permissions: true
          }
        }
      }
    });

    // If user is tenant super admin, allow access
    if (userTenant?.role.role === 'Admin') {
      return true;
    }

    // Check store-specific access
    const storeAccess = await this.prisma.userStoreAccess.findFirst({
      where: {
        userId,
        storeId,
        tenantId,
        isActive: true
      },
      include: {
        role: {
          include: {
            permissions: {
              where: {
                action: action as any,
                subject: subject as any,
                OR: [
                  { storeId: null }, // Tenant-wide permissions
                  { storeId } // Store-specific permissions
                ]
              }
            }
          }
        }
      }
    });

    return storeAccess?.role.permissions.length > 0;
  }

  /**
   * Get all stores a user has access to
   */
  async getUserAccessibleStores(userId: string, userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    // Check if user is tenant super admin
    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId, tenantId },
      include: {
        role: true
      }
    });

    if (userTenant?.role.role === 'Admin') {
      // Super admin has access to all stores
      return await this.prisma.store.findMany({
        where: { tenantId },
        include: {
          configuration: true
        }
      });
    }

    // Get stores user has explicit access to
    const storeAccess = await this.prisma.userStoreAccess.findMany({
      where: {
        userId,
        tenantId,
        isActive: true
      },
      include: {
        store: {
          include: {
            configuration: true
          }
        },
        role: true
      }
    });

    return storeAccess.map(access => ({
      ...access.store,
      userRole: access.role
    }));
  }

  /**
   * Revoke user access to a store
   */
  async revokeUserStoreAccess(
    userId: string,
    storeId: string,
    userContext?: { tenantId?: string, userId?: string }
  ) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    const storeAccess = await this.prisma.userStoreAccess.findFirst({
      where: {
        userId,
        storeId,
        tenantId,
        isActive: true
      }
    });

    if (!storeAccess) {
      throw new NotFoundException('Store access not found');
    }

    return await this.prisma.userStoreAccess.update({
      where: { id: storeAccess.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        assignedBy: userContext?.userId
      }
    });
  }
}