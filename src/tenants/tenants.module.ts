import { forwardRef, Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/mailer/email.service';
import { ConfigService } from '@nestjs/config';
import { FlutterwaveModule } from 'src/flutterwave/flutterwave.module';
import { TenantContext } from './context/tenant.context';

@Module({
  // imports: [FlutterwaveModule],
  imports: [
    forwardRef(() => FlutterwaveModule), // If needed
  ],
  controllers: [TenantsController],
  providers: [TenantsService, EmailService, ConfigService, PrismaService, TenantContext],
  exports: [TenantContext], // Make sure to export the TenantContext
})
export class TenantsModule {}


