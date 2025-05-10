import { PartialType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TenantStatus } from '@prisma/client';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {
  @ApiProperty({ 
    enum: TenantStatus, 
    example: TenantStatus.ACTIVE,
    description: 'Status of the tenant'
  })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
