import { forwardRef, Module } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
// import { TenantsModule } from '../tenants/tenants.module';
// import { TenantsModule } from 'src/tenants/tenants.module';
import { TenantsModule } from '../tenants/tenants.module';


@Module({
  imports: [
    forwardRef(() => TenantsModule), // Break circular dependency
  ],
  providers: [FlutterwaveService, ConfigService, PrismaService],
  exports: [FlutterwaveService],
})
export class FlutterwaveModule { }
