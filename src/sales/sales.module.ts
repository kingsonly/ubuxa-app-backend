import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { ContractService } from '../contract/contract.service';
import { EmailService } from '../mailer/email.service';
import { OpenPayGoService } from '../openpaygo/openpaygo.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [CloudinaryModule, TenantsModule],
  controllers: [SalesController],
  providers: [
    SalesService,
    PrismaService,
    PaymentService,
    OpenPayGoService,
    ContractService,
    EmailService,
    FlutterwaveService,
  ],
})
export class SalesModule {}
