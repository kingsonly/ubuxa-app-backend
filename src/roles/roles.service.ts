import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignUserToRoleDto } from './dto/assign-user.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ObjectId } from 'mongodb';
import { plainToInstance } from 'class-transformer';
import { RolesEntity } from './entity/roles.entity';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  private isValidObjectId(id: string): boolean {
    return ObjectId.isValid(id);
  }

  private get tenantId(): string {
    return this.request.user['tenantId'];
  }

  private get userId(): string {
    return this.request.user['id'];
  }

  async create(createRoleDto: CreateRoleDto) {
    const { role, active = true, permissionIds = [] } = createRoleDto;

    if (!this.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    if (!this.userId) {
      throw new ForbiddenException('Authentication required');
    }

    // Validate permission IDs format
    if (permissionIds.some(id => !this.isValidObjectId(id))) {
      throw new BadRequestException('One or more permission IDs are invalid');
    }

    try {
      // Check if permissions exist in tenant
      if (permissionIds.length > 0) {
        const permissionsCount = await this.prisma.permission.count({
          where: {
            id: { in: permissionIds },
            roles: { some: { tenantId: this.tenantId } }
          },
        });

        if (permissionsCount !== permissionIds.length) {
          throw new BadRequestException('One or more permissions not found in tenant');
        }
      }

      return await this.prisma.role.create({
        data: {
          role,
          active,
          tenantId: this.tenantId,
          created_by: this.userId,
          permissions: {
            connect: permissionIds.map(id => ({ id })),
          },
        },
        include: {
          permissions: true,
          creator: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(`Role '${role}' already exists in this tenant`);
        }
      }
      throw new InternalServerErrorException('Failed to create role');
    }
  }

  // async findAll() {
  //   try {
  //     // Use the tenant-aware findMany method
  //     const roles = await this.prisma.findManyWithTenant('Role', {
  //       where: {
  //         deleted_at: null,
  //         // tenantId:this.tenantId
  //       },
  //       include: {
  //         permissions: {
  //           select: {
  //             id: true,
  //             action: true,
  //             subject: true,
  //           },
  //         },
  //         creator: {
  //           select: {
  //             id: true,
  //             firstname: true,
  //             lastname: true,
  //             email: true,
  //           },
  //         },
  //         _count: {
  //           select: {
  //             memberships: true,
  //           },
  //         },
  //       },
  //       // orderBy: {
  //       //   created_at: 'desc',
  //       // },
  //     });

  //     return plainToInstance(RolesEntity, roles);
  //   } catch (error) {
  //     console.warn(error)
  //     throw new InternalServerErrorException('Failed to fetch roles');
  //   }
  // }

  async findAll() {
    if (!this.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const roles = await this.prisma.role.findMany({
      where: {
        tenantId: this.tenantId,
        deleted_at: null,
      },
      include: {
        permissions: {
          select: {
            id: true,
            action: true,
            subject: true,
          },
        },
        creator: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
        _count: {
          select: {
            memberships: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return plainToInstance(RolesEntity, roles);
  }

  async findOne(id: string) {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid role ID');
    }

    if (!this.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const role = await this.prisma.role.findUnique({
      where: {
        id,
        tenantId: this.tenantId,
        deleted_at: null,
      },
      include: {
        permissions: true,
        creator: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
        _count: {
          select: {
            memberships: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found in this tenant');
    }

    return role;
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid role ID');
    }

    if (!this.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const { role, active, permissionIds } = updateRoleDto;

    try {
      // First verify the role exists in tenant
      const existingRole = await this.prisma.role.findUnique({
        where: {
          id,
          tenantId: this.tenantId,
          deleted_at: null,
        },
      });

      if (!existingRole) {
        throw new NotFoundException('Role not found in this tenant');
      }

      // Check for role name conflict if changing name
      if (role && role !== existingRole.role) {
        const roleExists = await this.prisma.role.findFirst({
          where: {
            role,
            tenantId: this.tenantId,
            NOT: { id },
            deleted_at: null,
          },
        });

        if (roleExists) {
          throw new ConflictException(`Role '${role}' already exists in this tenant`);
        }
      }

      // Validate permission IDs if provided
      if (permissionIds) {
        if (permissionIds.some(id => !this.isValidObjectId(id))) {
          throw new BadRequestException('One or more permission IDs are invalid');
        }

        const permissionsCount = await this.prisma.permission.count({
          where: {
            id: { in: permissionIds },
            roles: { some: { tenantId: this.tenantId } }
          },
        });

        if (permissionsCount !== permissionIds.length) {
          throw new BadRequestException('One or more permissions not found in tenant');
        }
      }

      return await this.prisma.role.update({
        where: {
          id,
          tenantId: this.tenantId,
        },
        data: {
          role,
          active,
          permissions: permissionIds ? {
            set: permissionIds.map(id => ({ id })),
          } : undefined,
        },
        include: {
          permissions: true,
          creator: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Role not found');
        }
      }
      throw new InternalServerErrorException('Failed to update role');
    }
  }

  async remove(id: string) {
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException('Invalid role ID');
    }

    if (!this.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    try {
      // First verify the role exists in tenant
      const role = await this.prisma.role.findUnique({
        where: {
          id,
          tenantId: this.tenantId,
          deleted_at: null,
        },
        include: {
          _count: {
            select: {
              memberships: true,
            },
          },
        },
      });

      if (!role) {
        throw new NotFoundException('Role not found in this tenant');
      }

      // Check if role is assigned to any users
      if (role._count.memberships > 0) {
        throw new ConflictException(
          `Cannot delete role as it is assigned to ${role._count.memberships} user(s)`,
        );
      }

      // Soft delete the role
      return await this.prisma.role.update({
        where: {
          id,
          tenantId: this.tenantId,
        },
        data: {
          deleted_at: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Role not found');
        }
      }
      throw new InternalServerErrorException('Failed to delete role');
    }
  }

  async assignUserToRole(userId: string, assignUserToRoleDto: AssignUserToRoleDto) {
    const { roleId } = assignUserToRoleDto;

    if (!this.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    if (!this.isValidObjectId(userId) || !this.isValidObjectId(roleId)) {
      throw new BadRequestException('Invalid user or role ID');
    }

    try {
      // Verify user belongs to tenant
      const userTenant = await this.prisma.userTenant.findUnique({
        where: {
          userId_tenantId: {
            userId,
            tenantId: this.tenantId,
          },
        },
      });

      if (!userTenant) {
        throw new BadRequestException('User does not belong to this tenant');
      }

      // Verify role exists in tenant
      const roleExists = await this.prisma.role.findUnique({
        where: {
          id: roleId,
          tenantId: this.tenantId,
          deleted_at: null,
        },
      });

      if (!roleExists) {
        throw new NotFoundException('Role not found in this tenant');
      }

      await this.prisma.userTenant.update({
        where: {
          userId_tenantId: {
            userId,
            tenantId: this.tenantId,
          },
        },
        data: {
          roleId,
        },
      });

      return {
        message: 'User role updated successfully',
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('User or role not found');
        }
      }
      throw new InternalServerErrorException('Failed to assign role to user');
    }
  }

  async getRoleWithUsersAndPermissions(roleId: string) {
    if (!this.isValidObjectId(roleId)) {
      throw new BadRequestException('Invalid role ID');
    }

    if (!this.tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    const role = await this.prisma.role.findUnique({
      where: {
        id: roleId,
        tenantId: this.tenantId,
        deleted_at: null,
      },
      include: {
        permissions: true,
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true,
                status: true,
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found in this tenant');
    }

    return role;
  }
}