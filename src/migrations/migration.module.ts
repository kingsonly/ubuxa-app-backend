import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MigrateStoresCommand } from '../commands/migrate-stores.command';
import { MigrateInventoryBatchesCommand } from '../commands/migrate-inventory-batches.command';
import { CreateMainStoresMigration } from './create-main-stores.migration';
import { AllocateInventoryBatchesMigration } from './allocate-inventory-batches.migration';

@Module({
  imports: [PrismaModule], // Import PrismaModule if PrismaService is provided there
  providers: [
    MigrateStoresCommand,
    MigrateInventoryBatchesCommand,
    CreateMainStoresMigration,
    AllocateInventoryBatchesMigration,
  ],
  exports: [MigrateStoresCommand, MigrateInventoryBatchesCommand], // Export if needed by other modules
})
export class MigrationModule {}
