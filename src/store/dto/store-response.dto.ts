import { ApiProperty } from '@nestjs/swagger';
import { StoreClass } from '@prisma/client';

export class StoreResponseDto {
  @ApiProperty({
    description: 'Store ID',
    example: '507f1f77bcf86cd799439011',
  })
  id: string;

  @ApiProperty({
    description: 'Store name',
    example: 'Downtown Branch',
  })
  name: string;

  @ApiProperty({
    description: 'Store description',
    example: 'Main downtown location',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Store address',
    example: '123 Main St, Downtown',
    required: false,
  })
  address?: string;

  @ApiProperty({
    description: 'Store phone number',
    example: '+1234567890',
    required: false,
  })
  phone?: string;

  @ApiProperty({
    description: 'Store email',
    example: 'downtown@company.com',
    required: false,
  })
  email?: string;

  @ApiProperty({
    description: 'Store classification',
    enum: StoreClass,
    example: StoreClass.BRANCH,
  })
  classification: StoreClass;

  @ApiProperty({
    description: 'Whether the store is active',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Tenant ID',
    example: '507f1f77bcf86cd799439013',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Store creation date',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Store last update date',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Store deletion date (if soft deleted)',
    example: null,
    required: false,
  })
  deletedAt?: Date;
}