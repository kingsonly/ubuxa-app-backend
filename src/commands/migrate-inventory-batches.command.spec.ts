import { Test, TestingModule } from '@nestjs/testing';
import { MigrateInventoryBatchesCommand } from './migrate-inventory-batches.command';
import { AllocateInventoryBatchesMigration } from '../migrations/allocate-inventory-batches.migration';

describe('MigrateInventoryBatchesCommand', () => {
  let command: MigrateInventoryBatchesCommand;
  let migration: AllocateInventoryBatchesMigration;

  const mockMigration = {
    runMigration: jest.fn(),
    testMigration: jest.fn(),
    rollbackMigration: jest.fn(),
    validateMigration: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrateInventoryBatchesCommand,
        {
          provide: AllocateInventoryBatchesMigration,
          useValue: mockMigration,
        },
      ],
    }).compile();

    command = module.get<MigrateInventoryBatchesCommand>(
      MigrateInventoryBatchesCommand,
    );
    migration = module.get<AllocateInventoryBatchesMigration>(
      AllocateInventoryBatchesMigration,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('run', () => {
    it('should successfully run migration', async () => {
      mockMigration.runMigration.mockResolvedValue(undefined);

      await command.run();

      expect(mockMigration.runMigration).toHaveBeenCalledTimes(1);
    });

    it('should throw error when migration fails', async () => {
      const error = new Error('Migration failed');
      mockMigration.runMigration.mockRejectedValue(error);

      await expect(command.run()).rejects.toThrow('Migration failed');
      expect(mockMigration.runMigration).toHaveBeenCalledTimes(1);
    });
  });

  describe('test', () => {
    it('should successfully run migration test', async () => {
      mockMigration.testMigration.mockResolvedValue(undefined);

      await command.test();

      expect(mockMigration.testMigration).toHaveBeenCalledTimes(1);
    });

    it('should throw error when migration test fails', async () => {
      const error = new Error('Migration test failed');
      mockMigration.testMigration.mockRejectedValue(error);

      await expect(command.test()).rejects.toThrow('Migration test failed');
      expect(mockMigration.testMigration).toHaveBeenCalledTimes(1);
    });
  });

  describe('rollback', () => {
    it('should successfully run migration rollback', async () => {
      mockMigration.rollbackMigration.mockResolvedValue(undefined);

      await command.rollback();

      expect(mockMigration.rollbackMigration).toHaveBeenCalledTimes(1);
    });

    it('should throw error when migration rollback fails', async () => {
      const error = new Error('Migration rollback failed');
      mockMigration.rollbackMigration.mockRejectedValue(error);

      await expect(command.rollback()).rejects.toThrow(
        'Migration rollback failed',
      );
      expect(mockMigration.rollbackMigration).toHaveBeenCalledTimes(1);
    });
  });

  describe('validate', () => {
    it('should successfully validate migration', async () => {
      mockMigration.validateMigration.mockResolvedValue(true);

      await command.validate();

      expect(mockMigration.validateMigration).toHaveBeenCalledTimes(1);
    });

    it('should throw error when validation fails', async () => {
      mockMigration.validateMigration.mockResolvedValue(false);

      await expect(command.validate()).rejects.toThrow(
        'Migration validation failed',
      );
      expect(mockMigration.validateMigration).toHaveBeenCalledTimes(1);
    });

    it('should throw error when validation throws', async () => {
      const error = new Error('Validation error');
      mockMigration.validateMigration.mockRejectedValue(error);

      await expect(command.validate()).rejects.toThrow('Validation error');
      expect(mockMigration.validateMigration).toHaveBeenCalledTimes(1);
    });
  });
});
