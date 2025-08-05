import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
// import { JwtStrategy } from './strategy/jwt.strategy';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
// @Module({
//   imports: [
//     ConfigModule, // Make sure ConfigModule is available here
//     JwtModule.registerAsync({
//       imports: [ConfigModule],
//       useFactory: async (configService: ConfigService) => ({
//         secret: configService.get<string>('JWT_SECRET_KEY') || 'fallbackSecret',
//         signOptions: { expiresIn: '1d' },
//       }),
//       inject: [ConfigService],
//     }),
//     AuthModule
//   ],
//   controllers: [AdminController],
//   providers: [AdminService, PrismaService, AdminAuthGuard],
// })
// export class AdminModule { }
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET_KEY") || "fallbackSecret",
        signOptions: { expiresIn: "1d" },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    TenantModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, PrismaService, AdminAuthGuard],
})
export class AdminModule { }