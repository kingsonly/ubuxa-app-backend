import { Module } from '@nestjs/common';
import { InventorySaleService } from './inventory-sale.service';
import { InventorySaleController } from './inventory-sale.controller';

@Module({
  controllers: [InventorySaleController],
  providers: [InventorySaleService],
})
export class InventorySaleModule {}
