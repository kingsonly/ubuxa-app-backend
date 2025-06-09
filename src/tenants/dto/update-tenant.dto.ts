import { PartialType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TenantStatus, StoreType } from '@prisma/client';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiProperty({ 
    enum: TenantStatus, 
    example: TenantStatus.ACTIVE,
    description: 'Status of the tenant'
  })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiProperty({
    enum: StoreType,
    example: StoreType.SINGLE_STORE,
    description: 'Type of the store (single/multi-store)'
  })
  @IsOptional()
  @IsEnum(StoreType)
  storeType?: StoreType;
}
