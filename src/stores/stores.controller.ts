import { Controller, Post, Body, Req, Get, Param, UseGuards, Put, Delete, Query, Patch } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoreInventoryService } from './store-inventory.service';
import { StoreTransferService } from './store-transfer.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto, StoreConfigurationDto } from './dto/update-store.dto';
import { AddStoreInventoryDto, UpdateStoreInventoryDto, StoreInventoryFilterDto } from './dto/store-inventory.dto';
import { CreateStoreTransferDto, CreateStoreRequestDto, ApproveStoreRequestDto, RejectStoreRequestDto, TransferFilterDto } from './dto/store-transfer.dto';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { RolesAndPermissionsGuard } from 'src/auth/guards/roles.guard';
import { RolesAndPermissions } from 'src/auth/decorators/roles.decorator';
import { StoreAccessGuard } from './guards/store-access.guard';
import { StorePermissionGuard, RequireStoreAdmin, RequireStoreInventoryAccess, RequireStoreInventoryManage } from './guards/store-permission.guard';

@Controller('stores')
@ApiTags('Stores')
export class StoresController {
    constructor(
        private readonly storesService: StoresService,
        private readonly storeInventoryService: StoreInventoryService,
        private readonly storeTransferService: StoreTransferService
    ) {}

    @UseGuards(JwtAuthGuard, StorePermissionGuard)
    @Post()
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Create a new store' })
    @RequireStoreAdmin() // Only tenant super admin or store admin can create stores
    async create(@Body() createStoreDto: CreateStoreDto, @Req() req: any) {
        return this.storesService.createStore(createStoreDto, { tenantId: req.tenantId, storeId: req.storeId });
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'List all stores (user has access to)' })
    async list(@Req() req: any) {
        // This will return only stores the user has access to
        // Implementation should be updated to use StoreRolesService.getUserAccessibleStores
        return this.storesService.listStores({ tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard)
    @Get('hierarchy')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get store hierarchy' })
    async getHierarchy(@Req() req: any) {
        return this.storesService.getStoreHierarchy({ tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard)
    @Get('stats')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get store statistics' })
    async getStats(@Req() req: any) {
        return this.storesService.getStoreStats({ tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard, StoreAccessGuard)
    @Get(':id')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get a store by ID' })
    async get(@Param('id') id: string, @Req() req: any) {
        return this.storesService.getStore(id, { tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard, StorePermissionGuard)
    @RequireStoreAdmin('id')
    @Put(':id')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Update a store' })
    async update(@Param('id') id: string, @Body() dto: UpdateStoreDto, @Req() req: any) {
        return this.storesService.updateStore(id, dto, { tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard, StorePermissionGuard)
    @RequireStoreAdmin('id')
    @Delete(':id')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Delete a store' })
    async delete(@Param('id') id: string, @Req() req: any) {
        return this.storesService.deleteStore(id, { tenantId: req.tenantId });
    }

    // Store Configuration Endpoints
    @UseGuards(JwtAuthGuard)
    @Get(':id/configuration')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get store configuration' })
    async getConfiguration(@Param('id') storeId: string, @Req() req: any) {
        return this.storesService.getStoreConfiguration(storeId, { tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
    @RolesAndPermissions({ permissions: ['manage:Inventory'] })
    @Put(':id/configuration')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Update store configuration' })
    async updateConfiguration(@Param('id') storeId: string, @Body() dto: StoreConfigurationDto, @Req() req: any) {
        return this.storesService.updateStoreConfiguration(storeId, dto, { tenantId: req.tenantId });
    }

    // Store Inventory Endpoints
    @UseGuards(JwtAuthGuard, StorePermissionGuard)
    @RequireStoreInventoryAccess('id')
    @Get(':id/inventory')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get store inventory' })
    async getInventory(@Param('id') storeId: string, @Query() filters: StoreInventoryFilterDto, @Req() req: any) {
        return this.storeInventoryService.getStoreInventory(storeId, filters, { tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard, StorePermissionGuard)
    @RequireStoreInventoryManage('id')
    @Post(':id/inventory')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Add inventory to store' })
    async addInventory(@Param('id') storeId: string, @Body() dto: AddStoreInventoryDto, @Req() req: any) {
        return this.storeInventoryService.addInventoryToStore(storeId, dto, { 
            tenantId: req.tenantId, 
            userId: req.user.sub 
        });
    }

    @UseGuards(JwtAuthGuard, StorePermissionGuard)
    @RequireStoreInventoryManage('id')
    @Put(':id/inventory/:inventoryId')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Update store inventory' })
    async updateInventory(
        @Param('id') storeId: string, 
        @Param('inventoryId') inventoryId: string,
        @Body() dto: UpdateStoreInventoryDto, 
        @Req() req: any
    ) {
        return this.storeInventoryService.updateStoreInventory(storeId, inventoryId, dto, { 
            tenantId: req.tenantId 
        });
    }

    @UseGuards(JwtAuthGuard, StorePermissionGuard)
    @RequireStoreInventoryAccess('id')
    @Get(':id/inventory/stats')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get store inventory statistics' })
    async getInventoryStats(@Param('id') storeId: string, @Req() req: any) {
        return this.storeInventoryService.getStoreInventoryStats(storeId, { tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id/inventory/alerts')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get low stock alerts for store' })
    async getLowStockAlerts(@Param('id') storeId: string, @Req() req: any) {
        return this.storeInventoryService.getLowStockAlerts(storeId, { tenantId: req.tenantId });
    }

    // Store Transfer Endpoints
    @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
    @RolesAndPermissions({ permissions: ['write:Inventory'] })
    @Post(':id/transfers')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Create inventory transfer from store' })
    async createTransfer(@Param('id') fromStoreId: string, @Body() dto: CreateStoreTransferDto, @Req() req: any) {
        return this.storeTransferService.createTransfer(fromStoreId, dto, { 
            tenantId: req.tenantId, 
            userId: req.user.sub 
        });
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id/transfers')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get store transfers' })
    async getTransfers(@Param('id') storeId: string, @Query() filters: TransferFilterDto, @Req() req: any) {
        return this.storeTransferService.getTransfers(storeId, filters, { tenantId: req.tenantId });
    }

    // Store Request Endpoints
    @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
    @RolesAndPermissions({ permissions: ['write:Inventory'] })
    @Post(':id/requests')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Create inventory request from store' })
    async createRequest(@Param('id') fromStoreId: string, @Body() dto: CreateStoreRequestDto, @Req() req: any) {
        return this.storeTransferService.createRequest(fromStoreId, dto, { 
            tenantId: req.tenantId, 
            userId: req.user.sub 
        });
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id/requests')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get store requests' })
    async getRequests(@Param('id') storeId: string, @Query() filters: any, @Req() req: any) {
        return this.storeTransferService.getRequests(storeId, filters, { tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
    @RolesAndPermissions({ permissions: ['write:Inventory'] })
    @Put('requests/:requestId/approve')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Approve inventory request' })
    async approveRequest(@Param('requestId') requestId: string, @Body() dto: ApproveStoreRequestDto, @Req() req: any) {
        return this.storeTransferService.approveRequest(requestId, dto, { 
            tenantId: req.tenantId, 
            userId: req.user.sub 
        });
    }

    @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
    @RolesAndPermissions({ permissions: ['write:Inventory'] })
    @Put('requests/:requestId/reject')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Reject inventory request' })
    async rejectRequest(@Param('requestId') requestId: string, @Body() dto: RejectStoreRequestDto, @Req() req: any) {
        return this.storeTransferService.rejectRequest(requestId, dto, { 
            tenantId: req.tenantId, 
            userId: req.user.sub 
        });
    }
}

