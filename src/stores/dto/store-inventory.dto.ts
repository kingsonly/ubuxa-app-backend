import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class AddStoreInventoryDto {
  @ApiProperty({ example: '675b5f6042025a21a4cc3c4c', description: 'Inventory Item ID' })
  @IsNotEmpty()
  @IsString()
  inventoryId: string;

  @ApiProperty({ example: 100, description: 'Quantity to add' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 10, description: 'Minimum threshold for auto-restock', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumThreshold?: number;

  @ApiProperty({ example: 500, description: 'Maximum capacity', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maximumThreshold?: number;
}

export class UpdateStoreInventoryDto {
  @ApiProperty({ example: 50, description: 'New quantity', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiProperty({ example: 15, description: 'Minimum threshold', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumThreshold?: number;

  @ApiProperty({ example: 600, description: 'Maximum capacity', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  maximumThreshold?: number;
}

export class StoreInventoryFilterDto {
  @ApiProperty({ example: 1, description: 'Page number', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ example: 20, description: 'Items per page', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({ example: 'solar panel', description: 'Search term', required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ example: 'low_stock', description: 'Filter by stock level: low_stock, out_of_stock, in_stock', required: false })
  @IsOptional()
  @IsString()
  stockLevel?: 'low_stock' | 'out_of_stock' | 'in_stock';
}