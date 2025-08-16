import { Injectable, Logger } from '@nestjs/common';
import { AllocateInventoryBatchesMigration } from '../migrations/allocate-inventory-batches.migration';

@Injectable()
export class MigrateInventoryBatchesCommand {
  private readonly logger = new Logger(MigrateInventoryBatchesCommand.name);

  constructor(private readonly migration: AllocateInventoryBatchesMigration) {}

  /**
   * Run the complete migration process
   */
  async run(): Promise<void> {
    this.logger.log('Starting inventory batch allocation migration command...');
    try {
      await this.migration.runMigration();
      this.logger.log(
        'Inventory batch allocation migration command completed successfully',
      );
    } catch (error) {
      this.logger.error(
        'Inventory batch allocation migration command failed:',
        error,
      );
      throw error;
    }
  }

  /**
   * Test the migration without making changes (dry run)
   */
  async test(): Promise<void> {
    this.logger.log(
      'Starting inventory batch allocation migration test command...',
    );
    try {
      await this.migration.testMigration();
      this.logger.log(
        'Inventory batch allocation migration test command completed successfully',
      );
    } catch (error) {
      this.logger.error(
        'Inventory batch allocation migration test command failed:',
        error,
      );
      throw error;
    }
  }

  /**
   * Rollback the migration
   */
  async rollback(): Promise<void> {
    this.logger.log(
      'Starting inventory batch allocation migration rollback command...',
    );
    try {
      await this.migration.rollbackMigration();
      this.logger.log(
        'Inventory batch allocation migration rollback command completed successfully',
      );
    } catch (error) {
      this.logger.error(
        'Inventory batch allocation migration rollback command failed:',
        error,
      );
      throw error;
    }
  }

  /**
   * Validate existing migration
   */
  async validate(): Promise<void> {
    this.logger.log(
      'Starting inventory batch allocation migration validation command...',
    );
    try {
      const isValid = await this.migration.validateMigration();
      if (isValid) {
        this.logger.log(
          'Inventory batch allocation migration validation passed',
        );
      } else {
        throw new Error('Migration validation failed');
      }
    } catch (error) {
      this.logger.error(
        'Inventory batch allocation migration validation command failed:',
        error,
      );
      throw error;
    }
  }
}
