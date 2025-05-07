import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { MESSAGES } from 'src/constants';
import { BadRequestException } from '@nestjs/common';

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

        await this.prisma.tenant.create({
            data: {
                ...createTenantDto,
            },
        });

        return { message: MESSAGES.CREATED };
    }
}
