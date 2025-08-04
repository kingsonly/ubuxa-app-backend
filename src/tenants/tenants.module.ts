import { forwardRef, Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from './context/tenant.context';
import { BullModule } from '@nestjs/bullmq';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { EmailService } from '../mailer/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../../config/storage.provider';
import { EmailModule } from '../mailer/email.module';
@Module({
  imports: [
    forwardRef(() => FlutterwaveModule),
    EmailModule,
    BullModule.registerQueue({
      name: 'tenant-queue',
    }),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, EmailService, ConfigService, PrismaService, TenantContext, StorageService],
  exports: [TenantContext, StorageService, TenantsService], // Make sure to export the TenantContext
})
export class TenantsModule { }


