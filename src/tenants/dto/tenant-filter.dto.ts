import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TenantStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../utils/dto/pagination.dto';

export class TenantFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TenantStatus,
    description: 'Filter tenants by status'
  })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({
    description: 'Search in company name, first name, last name, or email'
  })
  @IsOptional()
  search?: string;
}
