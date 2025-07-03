import { Module } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoreInventoryService } from './store-inventory.service';
import { StoreTransferService } from './store-transfer.service';
import { StoresController } from './stores.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    StoresService,
    StoreInventoryService,
    StoreTransferService
  ],
  controllers: [StoresController],
  exports: [
    StoresService,
    StoreInventoryService,
    StoreTransferService
  ]
})
export class StoresModule {}
