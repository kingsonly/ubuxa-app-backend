import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TenantsModule } from '../tenants/tenants.module';
import { StorageService } from 'config/storage.provider';
import { PrismaModule } from '../prisma/prisma.module';
@Module({
  imports: [CloudinaryModule, TenantsModule,PrismaModule],
  controllers: [ContractController],
  providers: [ContractService, StorageService],
  exports: [ContractService],
})
export class ContractModule { }
