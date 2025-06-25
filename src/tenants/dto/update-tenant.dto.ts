import { PartialType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TenantStatus, TenantStoreType } from '@prisma/client';

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
    enum: TenantStoreType,
    example: TenantStoreType.SINGLE_STORE,
    description: 'Type of the store (single/multi-store)'
  })
  @IsOptional()
  @IsEnum(TenantStoreType)
  storeType?: TenantStoreType;
}
