import { IsString, IsNumber, IsArray, IsOptional, IsEnum, ValidateNested, IsObject, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '@prisma/client';

export class InventoryItemDto {
  @IsString()
  inventoryId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateInventorySalesDto {
  @IsString()
  customerId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventoryItems: InventoryItemDto[];

  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @IsOptional()
  @IsString()
  receiptNumber?: string; // Required for POS/CASH payments

  @IsOptional()
  @IsObject()
  miscellaneousCharges?: Record<string, number>;
}

export class PaymentWebhookDto {
  @IsString()
  transactionRef: string;

  @IsString()
  status: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}