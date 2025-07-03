import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateStoreDto {
  @ApiProperty({ example: 'Regional Store - North', description: 'Store Name', required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @ApiProperty({ example: true, description: 'Store active status', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 'North Region', description: 'Geographic region', required: false })
  @IsOptional()
  @IsString()
  region?: string;
}

export class StoreConfigurationDto {
  @ApiProperty({ example: true, description: 'Allow direct transfers without requests', required: false })
  @IsOptional()
  @IsBoolean()
  allowDirectTransfers?: boolean;

  @ApiProperty({ example: 100, description: 'Minimum quantity requiring approval', required: false })
  @IsOptional()
  requireApprovalFor?: number;

  @ApiProperty({ example: false, description: 'Auto-approve requests from parent stores', required: false })
  @IsOptional()
  @IsBoolean()
  autoApproveFromParent?: boolean;

  @ApiProperty({ example: true, description: 'Auto-approve requests to child stores', required: false })
  @IsOptional()
  @IsBoolean()
  autoApproveToChildren?: boolean;

  @ApiProperty({ example: '123 Main St, City, State', description: 'Store address', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'New York', description: 'City', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'NY', description: 'State', required: false })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({ example: 'USA', description: 'Country', required: false })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'John Doe', description: 'Store manager name', required: false })
  @IsOptional()
  @IsString()
  managerName?: string;

  @ApiProperty({ example: 'manager@store.com', description: 'Manager email', required: false })
  @IsOptional()
  @IsString()
  managerEmail?: string;

  @ApiProperty({ example: '+1-555-0123', description: 'Manager phone', required: false })
  @IsOptional()
  @IsString()
  managerPhone?: string;
}