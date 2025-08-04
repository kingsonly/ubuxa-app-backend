import { Injectable, Logger } from '@nestjs/common';
import { CreateMainStoresMigration } from '../migrations/create-main-stores.migration';


@Injectable()
export class MigrateStoresCommand {
  private readonly logger = new Logger(MigrateStoresCommand.name);

  constructor(private readonly migration: CreateMainStoresMigration) {}

  async run(): Promise<void> {
    this.logger.log('Starting store migration command...');
    try {
      await this.migration.runMigration();
      this.logger.log('Store migration command completed successfully');
    } catch (error) {
      this.logger.error('Store migration command failed:', error);
      throw error;
    }
  }
}
