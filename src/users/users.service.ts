import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { UserEntity } from './entity/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { MESSAGES } from '../constants';
import { validateOrReject } from 'class-validator';
import { ListUsersQueryDto } from './dto/list-users.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async userFilter(query: ListUsersQueryDto): Promise<Prisma.UserWhereInput> {
    const {
      search,
      firstname,
      lastname,
      username,
      email,
      phone,
      location,
      status,
      isBlocked,
      roleId,
      createdAt,
      updatedAt,
    } = query;

    const filterConditions: Prisma.UserWhereInput = {
      AND: [
        search
          ? {
            OR: [
              { firstname: { contains: search, mode: 'insensitive' } },
              { lastname: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
            ],
          }
          : {},
        firstname
          ? { firstname: { contains: firstname, mode: 'insensitive' } }
          : {},
        lastname
          ? { lastname: { contains: lastname, mode: 'insensitive' } }
          : {},
        username
          ? { username: { contains: username, mode: 'insensitive' } }
          : {},
        email ? { email: { contains: email, mode: 'insensitive' } } : {},
        phone ? { phone: { contains: phone, mode: 'insensitive' } } : {},
        location
          ? { location: { contains: location, mode: 'insensitive' } }
          : {},
        status ? { status } : {},
        isBlocked !== undefined ? { isBlocked } : {},
        //roleId ? { roleId } : {},
        createdAt ? { createdAt: { gte: new Date(createdAt) } } : {},
        updatedAt ? { updatedAt: { gte: new Date(updatedAt) } } : {},
      ],
    };

    return filterConditions;
  }

  // async getUsers(query: ListUsersQueryDto) {
  //   const { page = 1, limit = 100, sortField, sortOrder } = query;

  //   const filterConditions = await this.userFilter(query);

  //   const pageNumber = parseInt(String(page), 10);
  //   const limitNumber = parseInt(String(limit), 10);

  //   const skip = (pageNumber - 1) * limitNumber;
  //   const take = limitNumber;

  //   const orderBy = {
  //     [sortField || 'createdAt']: sortOrder || 'asc',
  //   };

  //   const result = await this.prisma.user.findMany({
  //     skip,
  //     take,
  //     where: filterConditions,
  //     orderBy,
  //     include: {
  //       role: {
  //         include: {
  //           permissions: true,
  //         },
  //       },
  //     },
  //   });

  //   const users = plainToInstance(UserEntity, result);

  //   const totalCount = await this.prisma.user.count({
  //     where: filterConditions,
  //   });

  //   return {
  //     users,
  //     total: totalCount,
  //     page,
  //     limit,
  //     totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
  //   };
  // }
  async getUsers(query: ListUsersQueryDto, req: Request) {
    const { page = 1, limit = 100, sortField, sortOrder } = query;
    const tenantId = req['tenantId'];

    if (!tenantId) {
      throw new BadRequestException('Tenant context is missing');
    }

    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const orderBy = {
      [sortField || 'createdAt']: sortOrder || 'asc',
    };

    // Fetch UserTenant records for the tenant
    const result = await this.prisma.userTenant.findMany({
      where: {
        tenantId,
      },
      skip,
      take,
      orderBy: {
        user: orderBy,
      },
      include: {
        user: true,
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    // Map UserTenant results into enriched user responses
    const users = result.map((ut) => ({
      ...ut.user,
      role: ut.role,
    }));

    const totalCount = await this.prisma.userTenant.count({
      where: {
        tenantId,
      },
    });

    return {
      users: plainToInstance(UserEntity, users),
      total: totalCount,
      page,
      limit,
      totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
    };
  }


  async updateUser(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
    }

    const validDto = plainToInstance(UpdateUserDto, updateUserDto);

    await validateOrReject(validDto);

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...validDto,
      },
    });

    return updatedUser;
  }

  // async fetchUser(id: string) {
  //   const user = await this.prisma.user.findUnique({
  //     where: { id },
  //     include: {
  //       role: {
  //         include: {
  //           permissions: true,
  //         },
  //       },
  //     },
  //   });

  //   if (!user) {
  //     throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
  //   }

  //   const serialisedData = plainToInstance(UpdateUserDto, user);

  //   return serialisedData;
  // }

  async fetchUser(id: string, req: Request) {
    const tenantId = req['tenantId'];

    if (!tenantId) {
      throw new BadRequestException('Tenant context is missing');
    }

    // Check UserTenant for the user in current tenant
    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        tenantId,
        userId: id,
      },
      include: {
        user: true,
        role: {
          include: {
            permissions: true,
          },
        },
      },
    });

    if (!userTenant || !userTenant.user) {
      throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
    }

    // Merge user info and tenant-specific role
    const enrichedUser = {
      ...userTenant.user,
      role: userTenant.role,
    };

    return plainToInstance(UpdateUserDto, enrichedUser);
  }


  // async deleteUser(id: string) {
  //   const user = await this.prisma.user.findUnique({
  //     where: { id },
  //   });

  //   if (!user) {
  //     throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
  //   }

  //   await this.prisma.user.delete({
  //     where: { id },
  //   });

  //   return {
  //     message: MESSAGES.DELETED,
  //   };
  // }
  async deleteUser(id: string, req: Request) {
    const tenantId = req['tenantId'];

    if (!tenantId) {
      throw new BadRequestException('Tenant context is missing');
    }

    // Check if the user belongs to this tenant
    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        tenantId,
        userId: id,
      },
    });

    if (!userTenant) {
      throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
    }

    // Delete user-tenant association instead of global user
    await this.prisma.userTenant.delete({
      where: {
        id: userTenant.id,
      },
    });

    return {
      message: MESSAGES.DELETED,
    };
  }

}
