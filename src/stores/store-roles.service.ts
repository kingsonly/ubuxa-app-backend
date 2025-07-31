import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StoreContext } from './context/store.context';
import { TenantContext } from '../tenants/context/tenant.context';

// DTOs for store role management
export interface CreateStoreRoleDto {
  name: string;
  description?: string;
  storeId?: string; // If null, it's a tenant-wide role
  permissionIds: string[];
  parentRoleId?: string;
}

export interface UpdateStoreRoleDto {
  name?: string;
  description?: string;
  active?: boolean;
  permissionIds?: string[];
  parentRoleId?: string;
}

export interface AssignUserToStoreDto {
  userId: string;
  storeId: string;
  storeRoleId: string;
}

export interface CreateStorePermissionDto {
  action: string; // StoreActionEnum
  subject: string; // StoreSubjectEnum
  storeId?: string; // If null, applies to all stores
  conditions?: any; // JSON conditions
}

export interface UserStoreAccessDto {
  userId: string;
  storeId?: string; // If null, check all stores
}

@Injectable()
export class StoreRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeContext: StoreContext,
    private readonly tenantContext: TenantContext
  ) {}

  /**
   * Create default store roles for a tenant
   */
  async createDefaultStoreRoles(tenantId: string, createdBy?: string) {
    const defaultRoles = [
      {
        name: 'Tenant Super Admin',
        description: 'Full access to all stores and tenant-wide operations',
        storeId: null, // Tenant-wide role
        permissions: [
          { action: 'manage', subject: 'all' },
        ]
      },
      {
        name: 'Store Admin',
        description: 'Full access to assigned store operations',
        storeId: null, // Will be assigned per store
        permissions: [
          { action: 'manage', subject: 'Store' },
          { action: 'manage', subject: 'StoreInventory' },
          { action: 'manage', subject: 'StoreBatchInventory' },
          { action: 'manage', subject: 'StoreTransfer' },
          { action: 'manage', subject: 'StoreUsers' },
          { action: 'read', subject: 'Reports' },
        ]
      },
      {
        name: 'Store Manager',
        description: 'Operational access to store with limited administrative functions',
        storeId: null,
        permissions: [
          { action: 'read', subject: 'Store' },
          { action: 'manage', subject: 'StoreInventory' },
          { action: 'manage', subject: 'StoreBatchInventory' },
          { action: 'create', subject: 'StoreTransfer' },
          { action: 'approve', subject: 'StoreRequest' },
          { action: 'read', subject: 'Reports' },
        ]
      },
      {
        name: 'Store Staff',
        description: 'Basic operational access to store inventory and sales',
        storeId: null,
        permissions: [
          { action: 'read', subject: 'Store' },
          { action: 'read', subject: 'StoreInventory' },
          { action: 'read', subject: 'StoreBatchInventory' },
          { action: 'create', subject: 'StoreRequest' },
          { action: 'manage', subject: 'Sales' },
        ]
      }
    ];

    const createdRoles = [];

    for (const roleData of defaultRoles) {
      // Create permissions first
      const permissions = [];
      for (const permData of roleData.permissions) {
        const permission = await this.prisma.storePermission.upsert({
          where: {
            tenantId_storeId_action_subject: {
              tenantId,
              storeId: roleData.storeId,
              action: permData.action as any,
              subject: permData.subject as any
            }
          },
          create: {
            action: permData.action as any,
            subject: permData.subject as any,
            storeId: roleData.storeId,
            tenantId
          },
          update: {}
        });
        permissions.push(permission);
      }

      // Create role
      const role = await this.prisma.storeRole.create({
        data: {
          name: roleData.name,
          description: roleData.description,
          storeId: roleData.storeId,
          tenantId,
          createdBy,
          permissionIds: permissions.map(p => p.id)
        },
        include: {
          permissions: true,
          store: true
        }
      });

      createdRoles.push(role);
    }

    return createdRoles;
  }

  /**
   * Create a new store role
   */
  async createStoreRole(dto: CreateStoreRoleDto, userContext?: { tenantId?: string, userId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const userId = userContext?.userId;

    // Verify store exists if storeId is provided
    if (dto.storeId) {
      const store = await this.prisma.store.findFirst({
        where: { id: dto.storeId, tenantId }
      });
      if (!store) {
        throw new NotFoundException('Store not found');
      }
    }

    // Verify permissions exist
    const permissions = await this.prisma.storePermission.findMany({
      where: {
        id: { in: dto.permissionIds },
        tenantId
      }
    });

    if (permissions.length !== dto.permissionIds.length) {
      throw new BadRequestException('One or more permissions not found');
    }

    // Create the role
    return await this.prisma.storeRole.create({
      data: {
        name: dto.name,
        description: dto.description,
        storeId: dto.storeId,
        tenantId,
        createdBy: userId,
        parentRoleId: dto.parentRoleId,
        permissionIds: dto.permissionIds
      },
      include: {
        permissions: true,
        store: true,
        parentRole: true
      }
    });
  }

  /**
   * Assign a user to a store with a specific role
   */
  async assignUserToStore(dto: AssignUserToStoreDto, userContext?: { tenantId?: string, userId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();
    const assignerId = userContext?.userId;

    // Verify user exists and belongs to tenant
    const user = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        tenants: {
          some: { tenantId }
        }
      }
    });

    if (!user) {
      throw new NotFoundException('User not found or not part of tenant');
    }

    // Verify store exists
    const store = await this.prisma.store.findFirst({
      where: { id: dto.storeId, tenantId }
    });

    if (!store) {
      throw new NotFoundException('Store not found');
    }

    // Verify store role exists
    const storeRole = await this.prisma.storeRole.findFirst({
      where: { id: dto.storeRoleId, tenantId }
    });

    if (!storeRole) {
      throw new NotFoundException('Store role not found');
    }

    // Check if user already has a role in this store
    const existingAssignment = await this.prisma.userStoreRole.findFirst({
      where: {
        userId: dto.userId,
        storeId: dto.storeId
      }
    });

    if (existingAssignment) {
      // Update existing assignment
      return await this.prisma.userStoreRole.update({
        where: { id: existingAssignment.id },
        data: {
          storeRoleId: dto.storeRoleId,
          assignedBy: assignerId,
          assignedAt: new Date(),
          isActive: true,
          revokedAt: null
        },
        include: {
          user: { select: { id: true, firstname: true, lastname: true, email: true } },
          store: { select: { id: true, name: true, type: true } },
          storeRole: { include: { permissions: true } }
        }
      });
    }

    // Create new assignment
    return await this.prisma.userStoreRole.create({
      data: {
        userId: dto.userId,
        storeId: dto.storeId,
        storeRoleId: dto.storeRoleId,
        tenantId,
        assignedBy: assignerId
      },
      include: {
        user: { select: { id: true, firstname: true, lastname: true, email: true } },
        store: { select: { id: true, name: true, type: true } },
        storeRole: { include: { permissions: true } }
      }
    });
  }

  /**
   * Get user's store access and permissions
   */
  async getUserStoreAccess(dto: UserStoreAccessDto, userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    const whereClause: any = {
      userId: dto.userId,
      tenantId,
      isActive: true
    };

    if (dto.storeId) {
      whereClause.storeId = dto.storeId;
    }

    const userStoreRoles = await this.prisma.userStoreRole.findMany({
      where: whereClause,
      include: {
        store: { select: { id: true, name: true, type: true } },
        storeRole: {
          include: {
            permissions: true,
            parentRole: {
              include: { permissions: true }
            }
          }
        }
      }
    });

    // Check for tenant-wide super admin role
    const tenantSuperAdmin = await this.prisma.userStoreRole.findFirst({
      where: {
        userId: dto.userId,
        tenantId,
        isActive: true,
        storeRole: {
          name: 'Tenant Super Admin',
          storeId: null // Tenant-wide role
        }
      },
      include: {
        storeRole: { include: { permissions: true } }
      }
    });

    return {
      userStoreRoles,
      isTenantSuperAdmin: !!tenantSuperAdmin,
      tenantSuperAdminRole: tenantSuperAdmin?.storeRole,
      hasAccessToAllStores: !!tenantSuperAdmin
    };
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

    // Check for tenant super admin first
    const superAdmin = await this.prisma.userStoreRole.findFirst({
      where: {
        userId,
        tenantId,
        isActive: true,
        storeRole: {
          name: 'Tenant Super Admin',
          storeId: null,
          permissions: {
            some: {
              OR: [
                { action: 'manage', subject: 'all' },
                { action: action as any, subject: subject as any },
                { action: action as any, subject: 'all' },
                { action: 'manage', subject: subject as any }
              ]
            }
          }
        }
      }
    });

    if (superAdmin) {
      return true;
    }

    // Check store-specific permissions
    const storeAccess = await this.prisma.userStoreRole.findFirst({
      where: {
        userId,
        storeId,
        tenantId,
        isActive: true,
       storeRole: {
  permissions: {
    some: {
      AND: [
        {
          OR: [
            { action: action as any, subject: subject as any },
            { action: action as any, subject: 'all' },
            { action: 'manage', subject: subject as any },
            { action: 'manage', subject: 'all' }
          ]
        },
        {
          OR: [
            { storeId: storeId },
            { storeId: null }
          ]
        }
      ]
    }
  }
}

      }
    });

    return !!storeAccess;
  }

  /**
   * Get all stores a user has access to
   */
  async getUserAccessibleStores(userId: string, userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    const userAccess = await this.getUserStoreAccess({ userId }, { tenantId });

    if (userAccess.isTenantSuperAdmin) {
      // Super admin has access to all stores
      return await this.prisma.store.findMany({
        where: { tenantId, isActive: true },
        include: {
          configuration: true,
          _count: {
            select: {
              storeInventories: true,
              users: true
            }
          }
        }
      });
    }

    // Get stores user has specific access to
    const storeIds = userAccess.userStoreRoles.map(usr => usr.store.id);
    
    return await this.prisma.store.findMany({
      where: {
        id: { in: storeIds },
        tenantId,
        isActive: true
      },
      include: {
        configuration: true,
        _count: {
          select: {
            storeInventories: true,
            users: true
          }
        }
      }
    });
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
    const revokerId = userContext?.userId;

    const userStoreRole = await this.prisma.userStoreRole.findFirst({
      where: {
        userId,
        storeId,
        tenantId,
        isActive: true
      }
    });

    if (!userStoreRole) {
      throw new NotFoundException('User store access not found');
    }

    return await this.prisma.userStoreRole.update({
      where: { id: userStoreRole.id },
      data: {
        isActive: false,
        revokedAt: new Date(),
        assignedBy: revokerId // Track who revoked access
      }
    });
  }

  /**
   * Get all users with access to a store
   */
  async getStoreUsers(storeId: string, userContext?: { tenantId?: string }) {
    const tenantId = userContext?.tenantId || this.tenantContext.requireTenantId();

    // Get users with specific store access
    const storeUsers = await this.prisma.userStoreRole.findMany({
      where: {
        storeId,
        tenantId,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            phone: true,
            status: true
          }
        },
        storeRole: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      }
    });

    // Get tenant super admins (they have access to all stores)
    const superAdmins = await this.prisma.userStoreRole.findMany({
      where: {
        tenantId,
        isActive: true,
        storeRole: {
          name: 'Tenant Super Admin',
          storeId: null
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            phone: true,
            status: true
          }
        },
        storeRole: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      }
    });

    return {
      storeSpecificUsers: storeUsers,
      tenantSuperAdmins: superAdmins,
      totalUsers: storeUsers.length + superAdmins.length
    };
  }
}