import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { PaginationQueryDto } from 'src/utils/dto/pagination.dto';
import { SalesType } from '@prisma/client';
import { InventorySalesService } from './inventory-sale.service';
import { CreateInventorySalesDto, PaymentWebhookDto } from './dto/create-inventory-sale.dto/create-inventory-sale.dto';

@Controller('inventory-sales')
export class InventorySalesController {
  constructor(private readonly inventorySalesService: InventorySalesService) {}

  @Post()
  async createInventorySale(
    @Body() createInventorySalesDto: CreateInventorySalesDto,
    @Req() req: any,
  ) {
    const creatorId = req.user?.id;
    return this.inventorySalesService.createInventorySale(creatorId, createInventorySalesDto);
  }

  @Get()
  async getAllSales(
    @Query() query: PaginationQueryDto & { salesType?: SalesType },
  ) {
    return this.inventorySalesService.getAllInventorySales(query);
  }

  @Get(':id')
  async getSaleById(@Param('id') id: string) {
    return this.inventorySalesService.getSaleById(id);
  }

  @Post('webhook/payment')
  @HttpCode(HttpStatus.OK)
  async processPaymentWebhook(@Body() webhookData: PaymentWebhookDto) {
    return this.inventorySalesService.processPaymentWebhook(webhookData);
  }
}
