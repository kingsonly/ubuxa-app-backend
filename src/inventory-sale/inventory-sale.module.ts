import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { InventorySalesController } from './inventory-sale.controller';
import { InventorySalesService } from './inventory-sale.service';
import { ContractModule } from '../contract/contract.module';
import { PaymentModule } from '../payment/payment.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { WebSocketModule } from '../websocket/websocket.module';


@Module({
  imports: [
    TenantsModule,
    ContractModule, // Provides ContractService
    PaymentModule,  // Provides PaymentService
    PrismaModule,   // Provides PrismaService
    CloudinaryModule, // Provides CloudinaryService
    WebSocketModule, // WebSocketModule

  ],
  controllers: [InventorySalesController],
  providers: [InventorySalesService],
})
export class InventorySaleModule {}