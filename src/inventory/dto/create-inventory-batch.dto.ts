import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateInventoryBatchDto {
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
    description: 'inventoryId Id',
    example: '',
  })
  @IsNotEmpty()
  @IsString()
  inventoryId: string;
}
