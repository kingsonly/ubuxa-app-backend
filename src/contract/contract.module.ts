import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [CloudinaryModule, TenantsModule],
  controllers: [ContractController],
  providers: [ContractService],
})
export class ContractModule {}
