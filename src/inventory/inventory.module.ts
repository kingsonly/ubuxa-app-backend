import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TenantsModule } from 'src/tenants/tenants.module';

@Module({
  imports: [CloudinaryModule,TenantsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
