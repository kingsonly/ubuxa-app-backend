import { Module } from '@nestjs/common';
import { TenantsModule } from 'src/tenants/tenants.module';
import { InventorySalesController } from './inventory-sale.controller';
import { InventorySalesService } from './inventory-sale.service';
import { SalesService } from 'src/sales/sales.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentService } from 'src/payment/payment.service';
import { OpenPayGoService } from 'src/openpaygo/openpaygo.service';


@Module({
   imports: [ TenantsModule],
  controllers: [InventorySalesController],
  providers: [
    InventorySalesService,
    SalesService,
      PrismaService,
      PaymentService,
      OpenPayGoService,
  ],
})
export class InventorySaleModule {}
