import { Module } from '@nestjs/common';
import { AdministratorController } from './administrator.controller';
import { AdministratorService } from './administrator.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EmailModule } from 'src/mailer/email.module';

@Module({
    imports: [EmailModule], // Add this line to import the module

  controllers: [AdministratorController],
  providers: [AdministratorService,  PrismaService,
      ConfigService,]
})
export class AdministratorModule {}
