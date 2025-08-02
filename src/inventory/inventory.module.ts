import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TenantsModule } from 'src/tenants/tenants.module';
import { StoresModule } from '../stores/stores.module';
import { StorageService } from 'config/storage.provider';

@Module({
  imports: [CloudinaryModule, TenantsModule, StoresModule],
  controllers: [InventoryController],
  providers: [InventoryService, StorageService],
  exports: [StorageService],
})
export class InventoryModule { }
