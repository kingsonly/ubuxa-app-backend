import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { TenantsModule } from 'src/tenants/tenants.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [TenantsModule, PrismaModule],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
