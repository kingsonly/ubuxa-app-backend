
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MigrateStoresCommand } from '../commands/migrate-stores.command';
import { CreateMainStoresMigration } from './create-main-stores.migration';


@Module({
  imports: [PrismaModule], // Import PrismaModule if PrismaService is provided there
  providers: [MigrateStoresCommand, CreateMainStoresMigration],
  exports: [MigrateStoresCommand], // Export if needed by other modules
})
export class MigrationModule {}