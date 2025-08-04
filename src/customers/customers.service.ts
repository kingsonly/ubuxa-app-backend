import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { MESSAGES } from '../constants';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UserStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { UserEntity } from '../users/entity/user.entity';
import { ListCustomersQueryDto } from './dto/list-customers.dto';
import { getLastNDaysDate } from '../utils/helpers.util';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { TenantContext } from '../tenants/context/tenant.context';
import { StorageService } from '../../config/storage.provider';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storageService: StorageService,
  ) { }

  async createCustomer(
    requestUserId: string,
    createCustomerDto: CreateCustomerDto,
    file: Express.Multer.File,
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const { landmark, longitude, latitude, email, ...rest } = createCustomerDto;

    const existingCustomer = await this.prisma.customer.findFirst({
      where: { email, tenantId },
    });

    if (existingCustomer) {
      throw new BadRequestException(MESSAGES.EMAIL_EXISTS);
    }
    let image = '';
    if (file) {
      const customerImage = (await this.uploadCustomerImage(file));
      image = customerImage.secure_url || customerImage.url;
    }

    await this.prisma.customer.create({
      data: {
        email,
        image,
        landmark,
        tenantId,
        creatorId: requestUserId,
        ...(longitude && { longitude }),
        ...(latitude && { latitude }),
        ...rest,
      },
    });

    return { message: MESSAGES.CREATED };
  }

  async customerFilter(
    query: ListCustomersQueryDto,
  ): Promise<Prisma.CustomerWhereInput> {

    const tenantId = this.tenantContext.requireTenantId();
    const {
      search,
      firstname,
      lastname,
      email,
      phone,
      location,
      status,
      createdAt,
      updatedAt,
      isNew,
    } = query;

    const filterConditions: Prisma.CustomerWhereInput = {
      AND: [

        { tenantId }, // ✅ Always include tenantId
        search
          ? {
            OR: [
              { firstname: { contains: search, mode: 'insensitive' } },
              { lastname: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
          : {},
        firstname
          ? { firstname: { contains: firstname, mode: 'insensitive' } }
          : {},
        lastname
          ? { lastname: { contains: lastname, mode: 'insensitive' } }
          : {},
        email ? { email: { contains: email, mode: 'insensitive' } } : {},
        phone ? { phone: { contains: phone, mode: 'insensitive' } } : {},
        location
          ? { location: { contains: location, mode: 'insensitive' } }
          : {},
        status ? { status } : {},
        isNew
          ? {
            createdAt: {
              gte: getLastNDaysDate(7),
            },
          }
          : {},
        createdAt ? {
          createdAt: {
            gte: new Date(createdAt),
            lt: new Date(new Date(createdAt).setDate(new Date(createdAt).getDate() + 1)),
          }
        } : {},
        updatedAt ? {
          updatedAt: {
            gte: new Date(updatedAt),
            lt: new Date(new Date(updatedAt).setDate(new Date(updatedAt).getDate() + 1)),
          }
        } : {},
      ],
    };

    return filterConditions;
  }

  async getCustomers(query: ListCustomersQueryDto) {
    console.log({ query });
    const { page = 1, limit = 100, sortField, sortOrder } = query;

    const filterConditions = await this.customerFilter(query);

    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const orderBy = {
      [sortField || 'createdAt']: sortOrder || 'asc',
    };

    const result = await this.prisma.customer.findMany({
      skip,
      take,
      where: {
        ...filterConditions,
      },
      orderBy,
    });

    const customers = plainToInstance(UserEntity, result);

    const totalCount = await this.prisma.customer.count({
      where: filterConditions,
    });

    return {
      customers,
      total: totalCount,
      page,
      limit,
      totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
    };
  }

  async getCustomer(id: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const customer = await this.prisma.customer.findUnique({
      where: {
        id,
        tenantId, // ✅ Filter by tenant

      },
    });

    if (!customer) {
      throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
    }

    return customer;
  }

  async deleteCustomer(id: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { sales: true },
    });

    if (!customer || customer.tenantId !== tenantId) {
      throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
    }

    if (customer.sales.length > 0) {
      // Customer has made purchases — update status instead of deleting
      await this.prisma.customer.update({
        where: { id },
        data: {
          status: UserStatus.barred, // 👈 Update to your enum value
          deletedAt: new Date(),
        },
      });

      return {
        message: "Customer has made purchases and was barred instead of deleted",
      };
    }

    await this.prisma.customer.delete({
      where: { id },
    });

    return {
      message: MESSAGES.DELETED,
    };
  }

  async getCustomerStats() {
    const tenantId = this.tenantContext.requireTenantId();
    const barredCustomerCount = await this.prisma.customer.count({
      where: {
        status: UserStatus.barred,
        tenantId, // ✅ Filter by tenant
      },
    });

    const newCustomerCount = await this.prisma.customer.count({
      where: {
        tenantId, // ✅ Filter by tenant
        createdAt: {
          gte: getLastNDaysDate(7),
        },
      },
    });

    const activeCustomerCount = await this.prisma.customer.count({
      where: {
        tenantId, // ✅ Filter by tenant
        status: UserStatus.active,
      },
    });

    const totalCustomerCount = await this.prisma.customer.count(
      {
        where: {
          tenantId, // ✅ Filter by tenant
        }
      }
    );

    return {
      barredCustomerCount,
      newCustomerCount,
      activeCustomerCount,
      totalCustomerCount,
    };
  }

  async getCustomerTabs(customerId: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const customer = await this.prisma.customer.findUnique({
      where: {
        tenantId, // ✅ Filter by tenant
        id: customerId,

      },
    });

    if (!customer) {
      throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
    }

    const tabs = [
      {
        name: 'Customer Details',
        url: `/customers/single/${customerId}`,
      },
      {
        name: 'RgistrationHistory',
        url: `/customers/${customerId}/registration-history`,
      },
      {
        name: 'Products',
        url: `/customers/${customerId}/products`,
      },
      {
        name: 'Contracts',
        url: `/customers/${customerId}/contracts`,
      },
      {
        name: 'Transactions',
        url: `/customers/${customerId}/transactions`,
      },
      {
        name: 'Tickets',
        url: `/customers/${customerId}/tickets`,
      },
    ];

    return tabs;
  }

  async uploadCustomerImage(file: Express.Multer.File) {
    const storage = await this.storageService.uploadFile(file, 'products');
    return await storage
  }

  async updateCustomer(
    customerId: string,
    updateCustomerDto: UpdateCustomerDto,
    file?: Express.Multer.File,
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const { email, longitude, latitude, landmark, ...rest } = updateCustomerDto;

    // Check if customer exists and belongs to tenant
    const existingCustomer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
      },
    });

    if (!existingCustomer) {
      throw new NotFoundException("Customer not found");
    }

    // If email is being updated, check if it already exists
    if (email && email !== existingCustomer.email) {
      const emailTaken = await this.prisma.customer.findFirst({
        where: {
          email,
          tenantId,
          NOT: { id: customerId },
        },
      });

      if (emailTaken) {
        throw new BadRequestException("Email is already taken by another customer");
      }
    }

    // Optional image upload
    let image = existingCustomer.image;
    if (file) {
      const uploaded = await this.uploadCustomerImage(file);
      image = uploaded.secure_url || uploaded.url;
    }

    // Update customer
    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        email,
        image,
        landmark,

        ...(longitude !== undefined && { longitude }),
        ...(latitude !== undefined && { latitude }),
        ...rest,
      },
    });

    return { message: "Customer updated successfully" };
  }

}
