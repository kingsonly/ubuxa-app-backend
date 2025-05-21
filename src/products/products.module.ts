import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [CloudinaryModule, TenantsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
