import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { OpenPayGoService } from '../openpaygo/openpaygo.service';
import { TenantsModule } from '../tenants/tenants.module';
import { BullModule } from '@nestjs/bullmq';
import { DeviceProcessor } from './device.processor';
import { SalesModule } from 'src/sales/sales.module';
import { DeviceTokenProcessor } from './device-token.processor';
import { SalesService } from 'src/sales/sales.service';
import { EmailService } from 'src/mailer/email.service';
import { TermiiService } from 'src/termii/termii.service';
import { TermiiModule } from 'src/termii/termii.module';
import { ContractModule } from 'src/contract/contract.module';
import { PaymentModule } from 'src/payment/payment.module';
import { HttpModule } from '@nestjs/axios';
import { UsersModule } from 'src/users/users.module';
import { OpenpaygoModule } from 'src/openpaygo/openpaygo.module';

@Module({
  imports: [
    TenantsModule,
    SalesModule,
    TermiiModule,
    PaymentModule,
    ContractModule,
    UsersModule,
    OpenpaygoModule,

    HttpModule.register({
      // you can optionally set a baseURL and timeout here:
      baseURL: 'https://v3.api.termii.com/api',
      timeout: 5000,
    }),
    BullModule.registerQueue(
      {
        name: 'csv-device-upload-queue',
      },
      {
        name: 'device-token-queue',

      }),
  ],
  controllers: [DeviceController],
  providers: [DeviceService, OpenPayGoService, DeviceProcessor, DeviceTokenProcessor, SalesService, EmailService, TermiiService, OpenPayGoService],
  exports: [DeviceService, BullModule]
})
export class DeviceModule { }
