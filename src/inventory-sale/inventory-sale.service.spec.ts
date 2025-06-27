import { Test, TestingModule } from '@nestjs/testing';
import { InventorySaleService } from './inventory-sale.service';

describe('InventorySaleService', () => {
  let service: InventorySaleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InventorySaleService],
    }).compile();

    service = module.get<InventorySaleService>(InventorySaleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
