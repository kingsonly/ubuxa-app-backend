import { Controller, Post, Body, Req, Get, Param, UseGuards } from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

@Controller('stores')
@ApiTags('Stores')
export class StoresController {
    constructor(private readonly storesService: StoresService) {}

    @UseGuards(JwtAuthGuard)
    @Post()
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Create a new store' })
    async create(@Body() createStoreDto: CreateStoreDto, @Req() req: any) {
        return this.storesService.createStore(createStoreDto, { tenantId: req.tenantId, storeId: req.storeId });
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'List all stores' })
    async list(@Req() req: any) {
        return this.storesService.listStores({ tenantId: req.tenantId });
    }

    @UseGuards(JwtAuthGuard)
    @Get(':id')
    @ApiBearerAuth('access_token')
    @ApiOperation({ summary: 'Get a store by ID' })
    async get(@Param('id') id: string, @Req() req: any) {
        return this.storesService.getStore(id, { tenantId: req.tenantId });
    }
}

