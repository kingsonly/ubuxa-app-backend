import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
   imports: [
      TenantsModule,
    ],
  controllers: [UsersController],
  providers: [UsersService, PrismaService],
})
export class UsersModule {}
