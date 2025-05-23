import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { EmailModule } from '../mailer/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './strategy/jwt.strategy';
import { PassportModule } from "@nestjs/passport"
import { TenantMiddleware } from './middleware/tenant.middleware';
import { TenantsModule } from 'src/tenants/tenants.module';
// @Module({
//   imports: [
//     PassportModule,
//     JwtModule.register({
//       secret: process.env.JWT_SECRET_KEY || "fallbackSecret",
//       signOptions: { expiresIn: "1d" },
//     }),
//     //   JwtModule.registerAsync({
//     //     imports: [ConfigModule],
//     //     inject: [ConfigService],
//     //     useFactory: async (configService: ConfigService) => {
//     //       return {
//     //         secret: configService.get<string>('JWT_SECRET_KEY'),
//     //         signOptions: { expiresIn: '7d' },
//     //       };
//     //     },
//     //   }),
//     EmailModule,
//   ],
//   controllers: [AuthController],
//   providers: [
//     AuthService,
//     PrismaService,
//     ConfigService,
//     JwtStrategy,
//     TenantMiddleware,
//   ],
//   exports: [AuthService, JwtStrategy, TenantMiddleware, JwtModule],
// })
// export class AuthModule { }

@Module({
  imports: [
    PassportModule,
    TenantsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET_KEY") || "fallbackSecret",
        signOptions: { expiresIn: "1d" },
      }),
    }),
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, JwtStrategy],
  exports: [AuthService, JwtStrategy, JwtModule,
    TenantsModule, // Add this line
  ],
})
export class AuthModule { }


