import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { StorageService } from '../../config/storage.provider';
import { TenantsModule } from '../tenants/tenants.module';
@Module({
  imports: [CloudinaryModule, TenantsModule],

  controllers: [ProductsController],
  providers: [ProductsService, StorageService],
  exports: [StorageService],
})
export class ProductsModule { }
