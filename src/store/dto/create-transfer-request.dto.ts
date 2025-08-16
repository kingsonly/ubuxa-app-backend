import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  IsNotEmpty,
} from 'class-validator';

export class CreateTransferRequestDto {
  @IsEnum(['ALLOCATION', 'TRANSFER'])
  type: 'ALLOCATION' | 'TRANSFER';

  @IsString()
  @IsNotEmpty()
  inventoryBatchId: string;

  @IsNumber()
  @Min(1)
  requestedQuantity: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sourceStoreId?: string; // Required for transfers

  @IsString()
  @IsNotEmpty()
  targetStoreId: string; // Required for transfers

  @IsOptional()
  @IsString()
  reason?: string;
}
