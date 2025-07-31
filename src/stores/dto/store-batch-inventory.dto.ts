import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsEnum, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BatchAllocationDto {
  @ApiProperty({ description: 'Inventory batch ID' })
  @IsString()
  inventoryBatchId: string;

  @ApiProperty({ description: 'Quantity to allocate from this batch', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Override price per unit for this batch' })
  @IsOptional()
  @IsNumber()
  pricePerUnit?: number;
}

export class AllocateInventoryBatchesToStoreDto {
  @ApiProperty({ description: 'Inventory item ID' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ 
    description: 'Array of batch allocations',
    type: [BatchAllocationDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchAllocationDto)
  batchAllocations: BatchAllocationDto[];

  @ApiProperty({ description: 'Total quantity being allocated', minimum: 1 })
  @IsNumber()
  @Min(1)
  totalQuantity: number;
}

export class AddStoreBatchInventoryDto {
  @ApiProperty({ description: 'Inventory item ID' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ description: 'Inventory batch ID' })
  @IsString()
  inventoryBatchId: string;

  @ApiProperty({ description: 'Quantity to add', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Price per unit for this batch' })
  @IsNumber()
  @Min(0)
  pricePerUnit: number;

  @ApiPropertyOptional({ description: 'Minimum threshold for low stock alerts' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumThreshold?: number;

  @ApiPropertyOptional({ description: 'Maximum threshold for this batch in store' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumThreshold?: number;
}

export class StoreBatchInventoryFilterDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search term for inventory name, SKU, or manufacturer' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ 
    description: 'Filter by stock level',
    enum: ['out_of_stock', 'low_stock', 'in_stock']
  })
  @IsOptional()
  @IsEnum(['out_of_stock', 'low_stock', 'in_stock'])
  stockLevel?: 'out_of_stock' | 'low_stock' | 'in_stock';

  @ApiPropertyOptional({ 
    description: 'Sort by field',
    enum: ['expiry_date', 'batch_number', 'quantity', 'price'],
    default: 'expiry_date'
  })
  @IsOptional()
  @IsEnum(['expiry_date', 'batch_number', 'quantity', 'price'])
  sortBy?: 'expiry_date' | 'batch_number' | 'quantity' | 'price';

  @ApiPropertyOptional({ 
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'asc'
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Include expired batches', default: false })
  @IsOptional()
  @IsBoolean()
  includeExpired?: boolean;
}

export class BatchTransferDto {
  @ApiProperty({ description: 'Source store ID' })
  @IsString()
  fromStoreId: string;

  @ApiProperty({ description: 'Destination store ID' })
  @IsString()
  toStoreId: string;

  @ApiProperty({ description: 'Inventory item ID' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ 
    description: 'Array of batch allocations to transfer',
    type: [BatchAllocationDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchAllocationDto)
  batchAllocations: BatchAllocationDto[];

  @ApiPropertyOptional({ 
    description: 'Type of transfer',
    enum: ['DISTRIBUTION', 'REQUEST_FULFILLMENT', 'EMERGENCY', 'REBALANCING'],
    default: 'DISTRIBUTION'
  })
  @IsOptional()
  @IsEnum(['DISTRIBUTION', 'REQUEST_FULFILLMENT', 'EMERGENCY', 'REBALANCING'])
  transferType?: 'DISTRIBUTION' | 'REQUEST_FULFILLMENT' | 'EMERGENCY' | 'REBALANCING';

  @ApiPropertyOptional({ description: 'Transfer notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GetAvailableBatchesDto {
  @ApiProperty({ description: 'Inventory item ID' })
  @IsString()
  inventoryId: string;

  @ApiProperty({ description: 'Requested quantity', minimum: 1 })
  @IsNumber()
  @Min(1)
  requestedQuantity: number;

  @ApiPropertyOptional({ 
    description: 'Allocation strategy',
    enum: ['FIFO', 'LIFO'],
    default: 'FIFO'
  })
  @IsOptional()
  @IsEnum(['FIFO', 'LIFO'])
  strategy?: 'FIFO' | 'LIFO';
}

export class BatchInventoryStatsDto {
  @ApiProperty({ description: 'Total number of batches' })
  totalBatches: number;

  @ApiProperty({ description: 'Total quantity across all batches' })
  totalQuantity: number;

  @ApiProperty({ description: 'Number of batches expiring soon (within 30 days)' })
  expiringSoon: number;

  @ApiProperty({ description: 'Number of low stock batches' })
  lowStockBatches: number;

  @ApiProperty({ description: 'Average price per unit across all batches' })
  averagePrice?: number;

  @ApiProperty({ description: 'Total value of inventory' })
  totalValue?: number;
}

export class BatchAllocationResultDto {
  @ApiProperty({ description: 'Suggested batch allocations', type: [BatchAllocationDto] })
  allocations: BatchAllocationDto[];

  @ApiProperty({ description: 'Whether the full quantity can be allocated' })
  fullyAllocated: boolean;

  @ApiProperty({ description: 'Quantity that cannot be allocated' })
  shortfall: number;

  @ApiProperty({ description: 'Total number of available batches' })
  totalBatches: number;
}