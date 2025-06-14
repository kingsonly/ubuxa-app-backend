import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PrismaService } from '../prisma/prisma.service';
import { T } from '@faker-js/faker/dist/airline-BUL6NtOJ';
import { TenantsModule } from 'src/tenants/tenants.module';


@Module({
  imports: [TenantsModule],
  controllers: [RolesController],
  providers: [RolesService, PrismaService],
})
export class RolesModule { }
