import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [TenantsModule, PrismaModule],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService], // Export StoreService for use in other modules
})
export class StoreModule {}
