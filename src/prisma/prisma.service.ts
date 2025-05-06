import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      // this.$extends
      this.logger.log('✅ Successfully connected to MongoDB via Prisma');
    } catch (error) {
      this.logger.error('❌ Failed to connect to MongoDB:', error.message);
      throw error;
    }

  }
}