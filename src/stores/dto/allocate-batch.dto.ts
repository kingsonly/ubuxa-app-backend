import { IsString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AllocateBatchDto {
  @ApiProperty({
    description: 'Inventory batch ID to allocate',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  batchId: string;

  @ApiProperty({
    description: 'Quantity to allocate to the store',
    example: 50,
    minimum: 1
  })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class TransferBatchDto {
  @ApiProperty({
    description: 'Source store ID',
    example: '507f1f77bcf86cd799439012'
  })
  @IsString()
  fromStoreId: string;

  @ApiProperty({
    description: 'Destination store ID',
    example: '507f1f77bcf86cd799439013'
  })
  @IsString()
  toStoreId: string;

  @ApiProperty({
    description: 'Inventory batch ID to transfer',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  batchId: string;

  @ApiProperty({
    description: 'Quantity to transfer',
    example: 25,
    minimum: 1
  })
  @IsInt()
  @Min(1)
  quantity: number;
}