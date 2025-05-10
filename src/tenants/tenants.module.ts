import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/mailer/email.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, EmailService, ConfigService, PrismaService]
})
export class TenantsModule {}
