import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
      TenantsModule,
    ],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
