import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsModule } from '../tenants/tenants.module';


@Module({
  imports: [TenantsModule],
  controllers: [RolesController],
  providers: [RolesService, PrismaService],
})
export class RolesModule { }
