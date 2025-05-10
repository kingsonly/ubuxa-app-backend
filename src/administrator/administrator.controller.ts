
import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { AdministratorService } from './administrator.service';
import { CreateTenantDto } from './dto/create-tenant.dto/create-tenant.dto';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto/create-tenant-admin.dto';
import {
    ApiBadRequestResponse,
    ApiInternalServerErrorResponse,
    ApiOkResponse,
} from '@nestjs/swagger';


@Controller('administrator')
export class AdministratorController {
    constructor(private readonly administratorService: AdministratorService) { }

    @Post("tenant")
    @ApiOkResponse({})
    @ApiBadRequestResponse({})
    @ApiInternalServerErrorResponse({})
    async createTenant(@Body() createTenantDto: CreateTenantDto) {
        return this.administratorService.createTenant(createTenantDto);
    }
    @Post(':id/admins')
    @ApiOkResponse({})
    @ApiBadRequestResponse({})
    @ApiInternalServerErrorResponse({})
    async createTenantAdmin(
        @Param('id') tenantId: string,
        @Body() createTenantAdminDto: CreateTenantAdminDto,
    ) {
        return this.administratorService.createTenantAdmin(tenantId, createTenantAdminDto);
    }

    @Get()
    @ApiOkResponse({})
    @ApiBadRequestResponse({})
    @ApiInternalServerErrorResponse({})
    async findAllTenants() {
        return this.administratorService.findAllTenants();
    }

    @Get(':id')
    async findTenantById(@Param('id') id: string) {
        return this.administratorService.findTenantById(id);
    }

    @Patch(':id')
    async updateTenant(@Param('id') id: string, @Body() updateData: any) {
        return this.administratorService.updateTenant(id, updateData);
    }

    @Delete(':id')
    async deleteTenant(@Param('id') id: string) {
        return this.administratorService.deleteTenant(id);
    }
}