import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantFilterDto } from './dto/tenant-filter.dto';
import { MESSAGES } from 'src/constants';
import { Tenant } from '@prisma/client';
import { createPaginatedResponse, createPrismaQueryOptions } from 'src/utils/helpers.util';

@Injectable()
export class TenantsService {
    constructor(private prisma: PrismaService) {}

    async createTenant(createTenantDto: CreateTenantDto) {
        const existingTenant = await this.prisma.tenant.findFirst({
            where: { email: createTenantDto.email },
        });

        if (existingTenant) {
            throw new BadRequestException(MESSAGES.EMAIL_EXISTS);
        }

        const tenant = await this.prisma.tenant.create({
            data: {
                ...createTenantDto,
            },
        });

        return { message: MESSAGES.CREATED, tenant };
    }

    async findAll(filterDto: TenantFilterDto) {
        const { status } = filterDto;
        
        // Define searchable fields
        const searchFields = ['companyName', 'firstName', 'lastName', 'email'];
        
        // Create filter options
        const filterOptions = status ? { status } : {};
        
        // Create Prisma query options
        const queryOptions = createPrismaQueryOptions(
            filterDto,
            searchFields,
            filterOptions
        );
        
        // Execute query with count
        const [data, total] = await Promise.all([
            this.prisma.tenant.findMany(queryOptions),
            this.prisma.tenant.count({ where: queryOptions.where })
        ]);
        
        // Return paginated response
        return createPaginatedResponse<Tenant>(data, total, filterDto);
    }

    async findOne(id: string) {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id },
        });

        if (!tenant) {
            throw new NotFoundException(`Tenant with ID ${id} not found`);
        }

        return tenant;
    }

    async update(id: string, updateTenantDto: UpdateTenantDto) {
        // Check if tenant exists
        await this.findOne(id);

        // Update tenant
        const updatedTenant = await this.prisma.tenant.update({
            where: { id },
            data: updateTenantDto,
        });

        return { message: MESSAGES.UPDATED, tenant: updatedTenant };
    }

    async remove(id: string) {
        // Check if tenant exists
        await this.findOne(id);

        // Delete tenant
        await this.prisma.tenant.delete({
            where: { id },
        });

        return { message: MESSAGES.DELETED };
    }
}
