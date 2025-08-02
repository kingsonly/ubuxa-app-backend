import { Module } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StoreContext } from './context/store.context';
import { CreateMainStoresMigration } from './migrations/create-main-stores.migration';
import { MigrateStoresCommand } from './commands/migrate-stores.command';

@Module({
  imports: [PrismaModule],
  controllers: [StoresController],
  providers: [
    StoresService,
    StoreContext,
    CreateMainStoresMigration,
    MigrateStoresCommand,
  ],
  exports: [
    StoresService,
    StoreContext,
    CreateMainStoresMigration,
  ],
})
export class StoresModule {}