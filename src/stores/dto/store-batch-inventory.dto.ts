import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';

export class AddInventoryToStoreDto {
  @ApiProperty({ description: 'Inventory item ID' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ description: 'Quantity to add', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Specific batch ID (optional)' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Price per unit (for batch-specific inventory)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerUnit?: number;
}

export class TransferInventoryDto {
  @ApiProperty({ description: 'Source store ID' })
  @IsString()
  fromStoreId: string;

  @ApiProperty({ description: 'Destination store ID' })
  @IsString()
  toStoreId: string;

  @ApiProperty({ description: 'Inventory item ID' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ description: 'Quantity to transfer', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Specific batch ID to transfer (optional)' })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ description: 'Transfer notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AutoAllocateInventoryDto {
  @ApiProperty({ description: 'Inventory item ID' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ description: 'Quantity to allocate', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ 
    description: 'Allocation strategy',
    enum: ['FIFO', 'LIFO'],
    default: 'FIFO'
  })
  @IsOptional()
  @IsEnum(['FIFO', 'LIFO'])
  strategy?: 'FIFO' | 'LIFO';
}