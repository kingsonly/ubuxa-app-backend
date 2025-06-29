import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryClass } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  Min,
  IsBoolean,
} from 'class-validator';

export class CreateInventoryDto {
  @ApiProperty({
    description: 'Inventory Name',
    example: 'Inventory 1',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Name of Manufacturer',
    example: 'Manufacturer 1',
  })
  @IsNotEmpty()
  @IsString()
  manufacturerName: string;

  @ApiPropertyOptional({
    description: 'Manufacture Date',
    example: '',
  })
  @IsOptional()
  @IsString()
  dateOfManufacture?: string;

  @ApiPropertyOptional({
    description: 'Inventory Sku',
    example: 'TXUNE989',
  })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({
    description: 'if the inventory has a unique serial number then it has a device and has device should be true, else has device should be false',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true
      if (value.toLowerCase() === "false") return false
      throw new BadRequestException("hasDevice must be a boolean value (true or false)")
    }
    if (typeof value === "boolean") return value
    throw new BadRequestException("hasDevice must be a boolean value")
  })
  hasDevice?: boolean;

  @ApiPropertyOptional({
    description: 'Cost of item',
    example: '',
  })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => {
    const parsedValue = Number(value);
    if (isNaN(parsedValue)) {
      throw new BadRequestException('Cost Of Item must be a valid number.');
    }
    return parsedValue;
  })
  costOfItem?: string;

  @ApiProperty({
    description: 'Price of item (NGN)',
    example: 'bduob',
  })
  @IsNumber()
  @Transform(({ value }) => {
    const parsedValue = Number(value);
    if (isNaN(parsedValue)) {
      throw new BadRequestException('Price must be a valid number.');
    }
    return parsedValue;
  })
  @IsNotEmpty()
  price: string;

  @ApiProperty({
    enum: InventoryClass,
    example: '',
  })
  @IsNotEmpty()
  @IsEnum(InventoryClass)
  class: InventoryClass;

  @ApiProperty({
    description: 'Number of Stock',
    example: '100',
  })
  @IsNumber()
  @Transform(({ value }) => {
    const parsedValue = Number(value);
    if (isNaN(parsedValue)) {
      throw new BadRequestException('Number of stock must be a valid number.');
    }
    return parsedValue;
  })
  @Min(1)
  @IsNotEmpty()
  numberOfStock: number;

  @ApiProperty({
    description: 'Category Id',
    example: '',
  })
  @IsNotEmpty()
  @IsString()
  inventoryCategoryId: string;

  @ApiProperty({
    description: 'Sub Category Id',
    example: '',
  })
  @IsNotEmpty()
  @IsString()
  inventorySubCategoryId: string;

  @ApiProperty({ type: 'string', format: 'binary' })
  inventoryImage: Express.Multer.File;
}
