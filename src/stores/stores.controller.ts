import { Controller, Post, Body, Req } from '@nestjs/common';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { ApiTags } from '@nestjs/swagger';

@Controller('stores')
@ApiTags('Stores')
export class StoresController {
    constructor(private readonly storesService: StoresService) {}

    @Post()
    async create(@Body() createStoreDto: CreateStoreDto, @Req() req: any) {
        return this.storesService.createStore(createStoreDto, req.user);
    }
}
