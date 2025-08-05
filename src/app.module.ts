import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './mailer/email.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProductsModule } from './products/products.module';
import { AgentsModule } from './agents/agents.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { PaymentModule } from './payment/payment.module';
import { DeviceModule } from './device/device.module';
import { ContractModule } from './contract/contract.module';
import { OpenpaygoModule } from './openpaygo/openpaygo.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { CronjobsModule } from './cronjobs/cronjobs.module';
import { AdminService } from './admin/admin.service';
import { AdminController } from './admin/admin.controller';
import { AdminModule } from './admin/admin.module';
import { TenantsModule } from './tenants/tenants.module';
import { TenantModule } from './tenant/tenant.module';
import { tenantMiddleware } from './tenant/tenant.middleware';
import { storeMiddleware } from './store/store.middleware';
import { InventorySaleModule } from './inventory-sale/inventory-sale.module';
import { WebSocketModule } from './websocket/websocket.module';
import { StoreModule } from './store/store.module';
import { MigrationModule } from './migrations/migration.module';


@Module({
  imports: [
    MigrationModule,
    // TenantsModule,
    // JwtModule.register({
    //   global: true, // Make JwtService available globally
    //   secret: process.env.JWT_SECRET_KEY || "fallbackSecret",
    //   signOptions: { expiresIn: '1d' },
    // }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          // host: configService.get<string>('REDIS_HOST'),
          // port: configService.get<number>('REDIS_PORT'),
          // password: configService.get<string>('REDIS_PASSWORD'),
          // username: configService.get<string>('REDIS_USERNAME'),
          url: configService.get<string>('REDIS_URL'),
        },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 10000, // 15 minutes
        limit: 600,
        blockDuration: 120000, // 2 mins
      },
    ]),

    ScheduleModule.forRoot(),

    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EmailModule,
    CloudinaryModule,
    PrismaModule,
    TenantModule,
    AuthModule,
    RolesModule,
    UsersModule,
    PermissionsModule,
    InventoryModule,
    ProductsModule,
    AgentsModule,
    CustomersModule,
    SalesModule,
    PaymentModule,
    DeviceModule,
    ContractModule,
    OpenpaygoModule,
    FlutterwaveModule,
    CronjobsModule,
    //TenantMiddleware,
    AdminModule,
    TenantsModule,
    InventorySaleModule,
    WebSocketModule,
    StoreModule,
  ],
  controllers: [AppController, AdminController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    AdminService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant middleware first (runs before store middleware)
    consumer.apply(tenantMiddleware).forRoutes("*");

    // Apply store middleware second (runs after tenant middleware)
    consumer.apply(storeMiddleware).forRoutes("*");
  }
}
