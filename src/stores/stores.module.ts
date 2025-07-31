import { Module } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoreInventoryService } from './store-inventory.service';
import { StoreBatchInventoryService } from './store-batch-inventory.service';
import { StoreTransferService } from './store-transfer.service';
import { StoreRolesService } from './store-roles.service';
import { StoresController } from './stores.controller';
import { StoreRolesController } from './store-roles.controller';
import { StoreContext } from './context/store.context';
import { StorePermissionGuard } from './guards/store-permission.guard';
import { StoreAccessGuard } from './guards/store-access.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [PrismaModule, TenantsModule],
  providers: [
    StoresService,
    StoreInventoryService,
    StoreBatchInventoryService,
    StoreTransferService,
    StoreRolesService,
    StoreContext,
    StorePermissionGuard,
    StoreAccessGuard
  ],
  controllers: [StoresController, StoreRolesController],
  exports: [
    StoresService,
    StoreInventoryService,
    StoreBatchInventoryService,
    StoreTransferService,
    StoreRolesService,
    StoreContext,
    StorePermissionGuard,
    StoreAccessGuard
  ]
})
export class StoresModule {}
