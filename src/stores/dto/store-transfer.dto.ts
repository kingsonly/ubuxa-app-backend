import { ApiProperty } from '@nestjs/swagger';
import { TransferType, TransferStatus, RequestPriority } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateStoreTransferDto {
  @ApiProperty({ example: '675b5f6042025a21a4cc3c4c', description: 'Destination Store ID' })
  @IsNotEmpty()
  @IsString()
  toStoreId: string;

  @ApiProperty({ example: '675b5f6042025a21a4cc3c4c', description: 'Inventory Item ID' })
  @IsNotEmpty()
  @IsString()
  inventoryId: string;

  @ApiProperty({ example: 50, description: 'Quantity to transfer' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ 
    example: TransferType.DISTRIBUTION, 
    description: 'Transfer type',
    enum: TransferType
  })
  @IsOptional()
  @IsEnum(TransferType)
  transferType?: TransferType = TransferType.DISTRIBUTION;

  @ApiProperty({ example: 'Emergency restock needed', description: 'Transfer notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateStoreRequestDto {
  @ApiProperty({ example: '675b5f6042025a21a4cc3c4c', description: 'Store to request from' })
  @IsNotEmpty()
  @IsString()
  toStoreId: string;

  @ApiProperty({ example: '675b5f6042025a21a4cc3c4c', description: 'Inventory Item ID' })
  @IsNotEmpty()
  @IsString()
  inventoryId: string;

  @ApiProperty({ example: 30, description: 'Requested quantity' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  requestedQuantity: number;

  @ApiProperty({ 
    example: RequestPriority.NORMAL, 
    description: 'Request priority',
    enum: RequestPriority
  })
  @IsOptional()
  @IsEnum(RequestPriority)
  priority?: RequestPriority = RequestPriority.NORMAL;

  @ApiProperty({ example: 'Running low on inventory for upcoming orders', description: 'Justification', required: false })
  @IsOptional()
  @IsString()
  justification?: string;

  @ApiProperty({ example: '2024-01-15', description: 'Expected delivery date', required: false })
  @IsOptional()
  @IsString()
  expectedDate?: string;
}

export class ApproveStoreRequestDto {
  @ApiProperty({ example: 25, description: 'Approved quantity (may be less than requested)' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  approvedQuantity: number;

  @ApiProperty({ example: 'Approved with reduced quantity due to limited stock', description: 'Approval notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectStoreRequestDto {
  @ApiProperty({ example: 'Insufficient inventory available', description: 'Rejection reason' })
  @IsNotEmpty()
  @IsString()
  rejectionReason: string;
}

export class TransferFilterDto {
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

  @ApiProperty({ 
    example: TransferStatus.PENDING, 
    description: 'Filter by status',
    enum: TransferStatus,
    required: false 
  })
  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @ApiProperty({ 
    example: TransferType.DISTRIBUTION, 
    description: 'Filter by transfer type',
    enum: TransferType,
    required: false 
  })
  @IsOptional()
  @IsEnum(TransferType)
  transferType?: TransferType;

  @ApiProperty({ example: '675b5f6042025a21a4cc3c4c', description: 'Filter by store ID', required: false })
  @IsOptional()
  @IsString()
  storeId?: string;
}