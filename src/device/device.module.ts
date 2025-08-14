import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { OpenPayGoService } from '../openpaygo/openpaygo.service';
import { TenantsModule } from '../tenants/tenants.module';
import { BullModule } from '@nestjs/bullmq';
import { DeviceProcessor } from './device.processor';
import { DeviceTokenProcessor } from './device-token.processor';

import { HttpModule } from '@nestjs/axios';
import { SalesModule } from '../sales/sales.module';
import { PaymentModule } from '../payment/payment.module';
import { TermiiModule } from '../termii/termii.module';
import { UsersModule } from '../users/users.module';
import { OpenpaygoModule } from '../openpaygo/openpaygo.module';
import { ContractModule } from '../contract/contract.module';
import { SalesService } from '../sales/sales.service';
import { EmailService } from '../mailer/email.service';
import { TermiiService } from '../termii/termii.service';
import { StoreModule } from 'src/store/store.module';

@Module({
  imports: [
    TenantsModule,
    SalesModule,
    TermiiModule,
    PaymentModule,
    ContractModule,
    UsersModule,
    OpenpaygoModule,
    StoreModule,

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
