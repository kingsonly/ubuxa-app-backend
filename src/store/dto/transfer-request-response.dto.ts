import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class TransferRequestResponseDto {
  @IsString()
  requestId: string;

  @IsEnum(['ALLOCATION', 'TRANSFER'])
  type: 'ALLOCATION' | 'TRANSFER';

  @IsString()
  sourceStoreId: string;

  @IsString()
  sourceStoreName: string;

  @IsString()
  targetStoreId: string;

  @IsString()
  targetStoreName: string;

  @IsString()
  inventoryBatchId: string;

  @IsString()
  inventoryName: string;

  @IsNumber()
  batchNumber: number;

  @IsNumber()
  requestedQuantity: number;

  @IsOptional()
  @IsNumber()
  approvedQuantity?: number;

  @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'])
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsString()
  requestedBy: string;

  @IsString()
  requestedByName: string;

  @IsDateString()
  requestedAt: string;

  @IsOptional()
  @IsString()
  approvedBy?: string;

  @IsOptional()
  @IsString()
  approvedByName?: string;

  @IsOptional()
  @IsDateString()
  approvedAt?: string;

  @IsOptional()
  @IsString()
  confirmedBy?: string;

  @IsOptional()
  @IsString()
  confirmedByName?: string;

  @IsOptional()
  @IsDateString()
  confirmedAt?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class PendingRequestsQueryDto {
  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

  @IsOptional()
  @IsEnum(['ALLOCATION', 'TRANSFER'])
  type?: 'ALLOCATION' | 'TRANSFER';

  @IsOptional()
  @IsString()
  sourceStoreId?: string;

  @IsOptional()
  @IsString()
  targetStoreId?: string;
}
