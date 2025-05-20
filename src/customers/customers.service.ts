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
import { TenantContext } from 'src/tenants/context/tenant.context';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService, private readonly tenantContext: TenantContext,
  ) {}

  async createCustomer(
    requestUserId: string,
    createCustomerDto: CreateCustomerDto,
  ) {
    const tenantId = this.tenantContext.requireTenantId();
    const { longitude, latitude, email, ...rest } = createCustomerDto;

    const existingCustomer = await this.prisma.customer.findFirst({
      where: { email , tenantId},
    });

    if (existingCustomer) {
      throw new BadRequestException(MESSAGES.EMAIL_EXISTS);
    }

    await this.prisma.customer.create({
      data: {
        email,
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
        createdAt ? { createdAt: { gte: new Date(createdAt) } } : {},
        updatedAt ? { updatedAt: { gte: new Date(updatedAt) } } : {},
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
    const user = await this.prisma.customer.findUnique({
      where: {
        id,
        tenantId, // ✅ Filter by tenant
      },
    });

    if (!user) {
      throw new NotFoundException(MESSAGES.USER_NOT_FOUND);
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
    {  where: {
        tenantId, // ✅ Filter by tenant
      }}
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
}
