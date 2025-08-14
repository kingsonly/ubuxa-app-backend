import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreContext } from './context/store.context';

@Module({
  imports: [TenantsModule, PrismaModule],
  controllers: [StoreController],
  providers: [StoreService, StoreContext],
  exports: [StoreService, StoreContext], // Export StoreService for use in other modules
})
export class StoreModule { }
