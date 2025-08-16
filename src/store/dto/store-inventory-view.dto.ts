import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InventoryBatchViewDto {
  @ApiProperty({
    description: 'Unique identifier of the inventory batch',
    example: 'batch-123-uuid',
  })
  @IsString()
  batchId: string;

  @ApiProperty({
    description: 'Batch number for identification',
    example: 1,
  })
  @IsNumber()
  batchNumber: number;

  @ApiProperty({
    description: 'Total quantity in the batch',
    example: 100,
  })
  @IsNumber()
  totalQuantity: number;

  @ApiProperty({
    description: 'Quantity allocated to this store',
    example: 25,
  })
  @IsNumber()
  allocatedToStore: number;

  @ApiProperty({
    description: 'Quantity reserved in this store',
    example: 5,
  })
  @IsNumber()
  reservedInStore: number;

  @ApiProperty({
    description: 'Available quantity in this store (allocated - reserved)',
    example: 20,
  })
  @IsNumber()
  availableInStore: number;

  @ApiProperty({
    description: 'Unit price of the batch',
    example: 15.99,
  })
  @IsNumber()
  unitPrice: number;

  @ApiProperty({
    description:
      'Whether this store owns the batch (has the highest allocation)',
    example: true,
  })
  @IsBoolean()
  isOwnedByStore: boolean;

  @ApiProperty({
    description: 'Name of the store that owns this batch',
    example: 'Main Store',
  })
  @IsString()
  ownerStoreName: string;
}

export class StoreInventoryViewDto {
  @ApiProperty({
    description: 'Unique identifier of the inventory item',
    example: 'inventory-456-uuid',
  })
  @IsString()
  inventoryId: string;

  @ApiProperty({
    description: 'Name of the inventory item',
    example: 'Premium Coffee Beans',
  })
  @IsString()
  inventoryName: string;

  @ApiProperty({
    description: 'List of inventory batches for this item',
    type: [InventoryBatchViewDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryBatchViewDto)
  batches: InventoryBatchViewDto[];

  @ApiProperty({
    description: 'Total quantity allocated to this store across all batches',
    example: 75,
  })
  @IsNumber()
  totalAllocated: number;

  @ApiProperty({
    description: 'Total available quantity in this store across all batches',
    example: 60,
  })
  @IsNumber()
  totalAvailable: number;
}
