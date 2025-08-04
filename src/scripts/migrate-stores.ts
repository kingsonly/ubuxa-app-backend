// import { NestFactory } from '@nestjs/core';
// import { AppModule } from '../app.module';
import { MigrateStoresCommand } from '../commands/migrate-stores.command';


// async function bootstrap() {
//   const app = await NestFactory.createApplicationContext(AppModule);

//   try {
//     const command = app.get(MigrateStoresCommand);
//     await command.run();
//     console.log('Migration completed successfully');
//   } catch (error) {
//     console.error('Migration failed:', error);
//     process.exit(1);
//   } finally {
//     await app.close();
//   }
// }

// bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';


async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const command = app.get(MigrateStoresCommand);
    await command.run();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();