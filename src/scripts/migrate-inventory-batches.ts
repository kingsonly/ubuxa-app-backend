import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MigrateInventoryBatchesCommand } from '../commands/migrate-inventory-batches.command';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const command = app.get(MigrateInventoryBatchesCommand);

    // Get command line arguments
    const args = process.argv.slice(2);
    const action = args[0] || 'run';

    switch (action) {
      case 'test':
        console.log(
          'Running inventory batch allocation migration test (dry run)...',
        );
        await command.test();
        console.log('Migration test completed successfully');
        break;

      case 'run':
        console.log('Running inventory batch allocation migration...');
        await command.run();
        console.log('Migration completed successfully');
        break;

      case 'rollback':
        console.log('Rolling back inventory batch allocation migration...');
        await command.rollback();
        console.log('Migration rollback completed successfully');
        break;

      case 'validate':
        console.log('Validating inventory batch allocation migration...');
        await command.validate();
        console.log('Migration validation completed successfully');
        break;

      default:
        console.log(
          'Usage: npm run migrate:inventory-batches [test|run|rollback|validate]',
        );
        console.log('  test     - Run migration test (dry run)');
        console.log('  run      - Run the migration (default)');
        console.log('  rollback - Rollback the migration');
        console.log('  validate - Validate existing migration');
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error(`Migration ${action} failed:`, error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
