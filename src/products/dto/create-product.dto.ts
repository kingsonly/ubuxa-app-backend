import {
  IsString,
  IsOptional,
  IsNotEmpty,
  ValidateIf,
  IsNumber,
  Min,
  ValidateNested,
  IsArray,
  IsEnum,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObjectId } from 'class-validator-mongo-object-id';
import { Transform, Type, plainToInstance } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';

export class ProductCapacityDto {
  @ApiProperty({ description: "Facility type (rooms, bulbs, etc.)" })
  @IsString()
  facility: string

  @ApiProperty({ description: "Maximum quantity for this facility" })
  @IsNumber()
  value: number
}

export class EAASDetailsDto {
  @ApiProperty({ description: "Cost of power per day in Naira" })
  @IsNumber()
  costOfPowerDaily: number

  @ApiProperty({ description: "One-time installation cost in Naira" })
  @IsNumber()
  costOfOneTimeInstallation: number

  @ApiProperty({ description: "Number of free power days after installation" })
  @IsNumber()
  numberOfDaysPowerAfterInstallation: number

  @ApiProperty({ description: "Maximum idle days before service termination" })
  @IsNumber()
  maximumIdleDays: number

  @ApiProperty({
    description: "How idle days reset - monthly, yearly, or lifetime",
    enum: ["MONTHLY", "YEARLY", "LIFETIME"],
  })
  @IsEnum(["MONTHLY", "YEARLY", "LIFETIME"])
  maximumIdleDaysSequence: "MONTHLY" | "YEARLY" | "LIFETIME"
}
export class ProductInventoryDetailsDto {
  @ApiProperty({
    description: 'Inventory ID.',
    example: '507f191e810c19729de860ea',
  })
  @IsNotEmpty()
  @IsString()
  @IsObjectId({
    message: 'Invalid Inventory Id',
  })
  @Transform(({ value }) => {
    // Handle both string and object cases
    console.log({ value })
    if (typeof value === 'object' && value.inventoryId) {
      return value.inventoryId;
    }
    return value;
  })
  inventoryId: string;

  @ApiProperty({
    description: 'Quantity',
    example: '100',
  })
  @IsNumber()
  @Transform(({ value }) => {
    const parsedValue = Number(value);
    if (isNaN(parsedValue)) {
      throw new BadRequestException('Quantity must be a valid number.');
    }
    return parsedValue;
  })
  @Min(1)
  @IsNotEmpty()
  quantity: number;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Name of the product' })
  name: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Optional description of the product' })
  description?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    default: 'NGN',
    description: 'Currency of the product',
  })
  currency: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'Payment modes for the product. The distinct payment modes should be concatenated together and separated by comma',
  })
  paymentModes: string;

  @IsString()
  @IsNotEmpty()
  @IsObjectId({
    message: 'Invalid Product Category',
  })
  @ApiProperty({ description: 'Product category Id of the product' })
  categoryId: string;

  @ApiProperty({
    description: 'An array of inventory details for this product.',
    type: ProductInventoryDetailsDto,
    required: true,
    isArray: true,
    default: [
      {
        inventoryId: '6745ba5dfe24f6583d4e5d3b',
        quantity: 100,
      },
    ],
  })
  @IsArray()
  @IsNotEmpty()
  @Transform(({ value }) => {
    try {
      const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
      if (!Array.isArray(parsedValue)) {
        throw new Error('Value must be an array');
      }
      return parsedValue;
    } catch (error) {
      throw new BadRequestException('Invalid format for inventories array');
    }
  })
  // @ValidateNested({ each: true })
  @Type(() => ProductInventoryDetailsDto)
  inventories: ProductInventoryDetailsDto[];

  @ApiProperty({ type: 'string', format: 'binary', description: 'Product image file' })
  productImage: Express.Multer.File;

  @ApiPropertyOptional({
    description: "Product capacity details",
    type: String,
    example: '[{"facility": "rooms", "value": 5}]',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return plainToInstance(ProductCapacityDto, parsed);
      } catch {
        return [];
      }
    }
    return plainToInstance(ProductCapacityDto, value);
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCapacityDto)
  productCapacity?: ProductCapacityDto[]

  @ApiPropertyOptional({
    description: "Energy as a Service details",
    type: String,
    example: '{"costOfPowerDaily": 100, "costOfOneTimeInstallation": 50000}',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return plainToInstance(EAASDetailsDto, parsed);
      } catch {
        return null;
      }
    }
    return plainToInstance(EAASDetailsDto, value);
  })
  @ValidateNested()
  @Type(() => EAASDetailsDto)
  eaasDetails?: EAASDetailsDto
}
