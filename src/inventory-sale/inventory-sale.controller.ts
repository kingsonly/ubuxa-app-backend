import { Controller } from '@nestjs/common';
import { InventorySaleService } from './inventory-sale.service';

@Controller('inventory-sale')
export class InventorySaleController {
  constructor(private readonly inventorySaleService: InventorySaleService) {}
}
