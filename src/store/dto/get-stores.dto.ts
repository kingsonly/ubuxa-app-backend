import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { StoreClass } from '@prisma/client';
import { PaginationQueryDto } from '../../utils/dto/pagination.dto';

export class GetStoresDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by store classification',
    enum: StoreClass,
    example: StoreClass.BRANCH,
  })
  @IsOptional()
  @IsEnum(StoreClass)
  classification?: StoreClass;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by creation date (ISO format)',
    type: String,
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({
    description: 'Filter by last update date (ISO format)',
    type: String,
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}