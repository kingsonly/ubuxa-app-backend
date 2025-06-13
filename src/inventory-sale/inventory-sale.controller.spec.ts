import { Test, TestingModule } from '@nestjs/testing';
import { InventorySaleController } from './inventory-sale.controller';
import { InventorySaleService } from './inventory-sale.service';

describe('InventorySaleController', () => {
  let controller: InventorySaleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventorySaleController],
      providers: [InventorySaleService],
    }).compile();

    controller = module.get<InventorySaleController>(InventorySaleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
