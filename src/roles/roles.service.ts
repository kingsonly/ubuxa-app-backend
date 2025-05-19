import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignUserToRoleDto } from './dto/assign-user.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ObjectId } from 'mongodb';
import { plainToInstance } from 'class-transformer';
import { RolesEntity } from './entity/roles.entity';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) { }

  // Helper function to validate MongoDB ObjectId
  private isValidObjectId(id: string): boolean {
    return ObjectId.isValid(id);
  }

  async create(createRoleDto: CreateRoleDto, id: string, req) {
    const { role, active, permissionIds } = createRoleDto;

    // Check if the role already exists
    const existingRole = await this.prisma.role.findUnique({
      where: {
        role_tenantId: {
          role,
          tenantId: req.tenantId,
        },
      },
    });

    if (existingRole) {
      throw new ConflictException(`Role with name ${role} already exists`);
    }

    // Validate permission IDs
    if (
      permissionIds &&
      permissionIds.some((id) => !this.isValidObjectId(id))
    ) {
      throw new BadRequestException(`One or more permission IDs are invalid`);
    }

    return this.prisma.role.create({
      data: {
        role,
        // created_by,
        active,
        permissions: {
          connect: permissionIds?.map((id) => ({ id })),
        },
        creator: {
          connect: { id: id }, // Connect the user who created the role
        },
      },
    });
  }

  async findAll() {
    const result = await this.prisma.role.findMany({
      include: {
        permissions: {
          select: {
            id: true,
            action: true,
            subject: true,
          },
        },
        _count: {
          select: { users: true },
        },
        creator: true,
      },
    });

    const roles = plainToInstance(RolesEntity, result);

    return roles;
  }

  async findOne(id: string) {
    // Validate ObjectId
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ID: ${id}`);
    }

    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }

    return role;
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    // Validate ObjectId
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ID: ${id}`);
    }

    const { role, active, permissionIds } = updateRoleDto;

    // Validate permission IDs
    if (
      permissionIds &&
      permissionIds.some((id) => !this.isValidObjectId(id))
    ) {
      throw new BadRequestException(`One or more permission IDs are invalid`);
    }

    // Prepare the data object for Prisma
    const data: any = {};
    if (role !== undefined) data.role = role;
    if (active !== undefined) data.active = active;
    if (permissionIds !== undefined) {
      data.permissions = {
        set: [],
        connect: permissionIds.map((id) => ({ id })),
      };
    }

    if (role !== undefined) {
      const existingRole = await this.prisma.role.findFirst({
        where: {
          role,
          NOT: { id },
        },
      });

      if (existingRole) {
        throw new ConflictException(`Role with name ${role} already exists`);
      }
    }

    try {
      return await this.prisma.role.update({
        where: { id },
        data,
        include: { permissions: true },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Role with id ${id} not found`);
        }
      }
      console.log({ error })
      throw new InternalServerErrorException('An unexpected error occurred');
    }
  }

  async remove(id: string) {
    // Validate ObjectId
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid ID: ${id}`);
    }

    try {
      await this.prisma.role.update({
        where: { id: id },
        data: {
          permissions: {
            set: [], // disconnect all permissions
          },
        },
      });
      const role = await this.prisma.role.delete({
        where: { id },
      });

      if (!role) {
        throw new NotFoundException(`Role with id ${id} not found`);
      }

      return role;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Role with id ${id} not found`);
        }
      }
      throw new InternalServerErrorException('An unexpected error occurred');
    }
  }

  // async assignUserToRole(id: string, assignUserToRoleDto: AssignUserToRoleDto) {
  //   // Validate ObjectId for user
  //   if (!this.isValidObjectId(id)) {
  //     throw new BadRequestException(`Invalid user ID: ${id}`);
  //   }

  //   const { roleId } = assignUserToRoleDto;

  //   // Validate ObjectId for role
  //   if (roleId && !this.isValidObjectId(roleId)) {
  //     throw new BadRequestException(`Invalid role ID: ${roleId}`);
  //   }

  //   // Check if the role exists
  //   const roleExists = await this.prisma.role.findUnique({
  //     where: { id: roleId },
  //   });

  //   if (!roleExists) {
  //     throw new NotFoundException(`Role with ID ${roleId} not found`);
  //   }

  //   await this.prisma.user.update({
  //     where: { id },
  //     data: {
  //       role: { connect: { id: roleId } },
  //     },
  //   });

  //   return {
  //     message: 'This user has been assigned to a role successfully',
  //   };
  // }

  async assignUserToRole(
    userId: string,
    assignUserToRoleDto: AssignUserToRoleDto,
    req: Request,
  ) {
    const tenantId = req['tenantId'];

    if (!tenantId) {
      throw new BadRequestException('Tenant context is missing');
    }

    // Validate ObjectIds
    if (!this.isValidObjectId(userId)) {
      throw new BadRequestException(`Invalid user ID: ${userId}`);
    }

    const { roleId } = assignUserToRoleDto;

    if (!roleId || !this.isValidObjectId(roleId)) {
      throw new BadRequestException(`Invalid role ID: ${roleId}`);
    }

    // Check role exists
    const roleExists = await this.prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!roleExists) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    // Check if user exists
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if the user is already in this tenant
    const existingUserTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId,
      },
    });

    if (existingUserTenant) {
      // Update role if user-tenant link exists
      await this.prisma.userTenant.update({
        where: { id: existingUserTenant.id },
        data: { roleId },
      });
    } else {
      // Otherwise, create the user-tenant-role relationship
      await this.prisma.userTenant.create({
        data: {
          userId,
          tenantId,
          roleId,
        },
      });
    }

    return {
      message: 'User has been assigned to the role within this tenant successfully',
    };
  }


  async getRoleWithUsersAndPermissions(roleId: string) {
    // Validate ObjectId
    if (!this.isValidObjectId(roleId)) {
      throw new BadRequestException(`Invalid role ID: ${roleId}`);
    }

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        users: true,
        permissions: true,
      },
    });
  }
}
