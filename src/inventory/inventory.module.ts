import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TenantsModule } from '../tenants/tenants.module';
import { StorageService } from '../../config/storage.provider';

@Module({
  imports: [CloudinaryModule, TenantsModule],
  controllers: [InventoryController],
  providers: [InventoryService, StorageService],
  exports: [StorageService],
})
export class InventoryModule { }
