import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { StoreInventoryController } from './store-inventory.controller';
import { StoreInventoryService } from './store-inventory.service';
import { TenantsModule } from '../tenants/tenants.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TenantsModule, PrismaModule, UsersModule],
  controllers: [StoreController, StoreInventoryController],
  providers: [StoreService, StoreInventoryService],
  exports: [StoreService, StoreInventoryService], // Export services for use in other modules
})
export class StoreModule {}
