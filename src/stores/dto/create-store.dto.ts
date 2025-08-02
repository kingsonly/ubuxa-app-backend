import { IsString, IsOptional, IsBoolean, IsEmail, IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStoreDto {
  @ApiProperty({
    description: 'Store name',
    example: 'Downtown Branch'
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Store description',
    example: 'Main downtown location',
    required: false
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Store address',
    example: '123 Main St, Downtown',
    required: false
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    description: 'Store phone number',
    example: '+1234567890',
    required: false
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Store email',
    example: 'downtown@company.com',
    required: false
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    description: 'Whether this is the main store',
    example: false,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiProperty({
    description: 'Whether the store is active',
    example: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}