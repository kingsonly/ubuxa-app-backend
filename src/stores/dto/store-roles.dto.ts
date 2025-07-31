import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean, IsUUID } from 'class-validator';

export class CreateStoreRoleDto {
  @ApiProperty({ description: 'Role name', example: 'Store Manager' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Role description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Store ID (null for tenant-wide role)' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiProperty({ description: 'Array of permission IDs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  permissionIds: string[];

  @ApiPropertyOptional({ description: 'Parent role ID for role hierarchy' })
  @IsOptional()
  @IsString()
  parentRoleId?: string;
}

export class UpdateStoreRoleDto {
  @ApiPropertyOptional({ description: 'Role name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Role description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Role active status' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Array of permission IDs', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionIds?: string[];

  @ApiPropertyOptional({ description: 'Parent role ID' })
  @IsOptional()
  @IsString()
  parentRoleId?: string;
}

export class AssignUserToStoreDto {
  @ApiProperty({ description: 'User ID to assign' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Store ID' })
  @IsString()
  storeId: string;

  @ApiProperty({ description: 'Store role ID to assign' })
  @IsString()
  storeRoleId: string;
}

export class CreateStorePermissionDto {
  @ApiProperty({ 
    description: 'Action that can be performed',
    enum: ['manage', 'read', 'create', 'update', 'delete', 'transfer', 'receive', 'approve', 'reject', 'allocate', 'reserve', 'adjust', 'report', 'export', 'configure', 'assign']
  })
  @IsString()
  action: string;

  @ApiProperty({ 
    description: 'Subject/resource the action applies to',
    enum: ['all', 'Store', 'StoreConfiguration', 'StoreUsers', 'StoreInventory', 'StoreBatchInventory', 'InventoryBatch', 'StoreTransfer', 'StoreBatchTransfer', 'StoreRequest', 'StoreBatchRequest', 'Sales', 'Customers', 'Products', 'Reports', 'Analytics', 'Settings', 'Logs']
  })
  @IsString()
  subject: string;

  @ApiPropertyOptional({ description: 'Store ID (null for tenant-wide permission)' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Additional permission conditions (JSON)' })
  @IsOptional()
  conditions?: any;
}

export class UserStoreAccessDto {
  @ApiProperty({ description: 'User ID to check access for' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ description: 'Specific store ID (null to check all stores)' })
  @IsOptional()
  @IsString()
  storeId?: string;
}

export class StoreUserResponseDto {
  @ApiProperty({ description: 'User information' })
  user: {
    id: string;
    firstname: string;
    lastname: string;
    email: string;
    phone?: string;
    status: string;
  };

  @ApiProperty({ description: 'Store role information' })
  storeRole: {
    id: string;
    name: string;
    description?: string;
  };

  @ApiProperty({ description: 'Assignment metadata' })
  assignedAt: Date;
  isActive: boolean;
}

export class UserStoreAccessResponseDto {
  @ApiProperty({ description: 'Store-specific role assignments', type: [StoreUserResponseDto] })
  userStoreRoles: StoreUserResponseDto[];

  @ApiProperty({ description: 'Whether user is a tenant super admin' })
  isTenantSuperAdmin: boolean;

  @ApiProperty({ description: 'Tenant super admin role details' })
  tenantSuperAdminRole?: {
    id: string;
    name: string;
    description?: string;
    permissions: any[];
  };

  @ApiProperty({ description: 'Whether user has access to all stores' })
  hasAccessToAllStores: boolean;
}

export class StoreUsersResponseDto {
  @ApiProperty({ description: 'Users with specific store access', type: [StoreUserResponseDto] })
  storeSpecificUsers: StoreUserResponseDto[];

  @ApiProperty({ description: 'Tenant super admins (have access to all stores)', type: [StoreUserResponseDto] })
  tenantSuperAdmins: StoreUserResponseDto[];

  @ApiProperty({ description: 'Total number of users with store access' })
  totalUsers: number;
}

export class StoreRoleResponseDto {
  @ApiProperty({ description: 'Role ID' })
  id: string;

  @ApiProperty({ description: 'Role name' })
  name: string;

  @ApiProperty({ description: 'Role description' })
  description?: string;

  @ApiProperty({ description: 'Whether role is active' })
  active: boolean;

  @ApiProperty({ description: 'Store ID (null for tenant-wide role)' })
  storeId?: string;

  @ApiProperty({ description: 'Store information' })
  store?: {
    id: string;
    name: string;
    type: string;
  };

  @ApiProperty({ description: 'Role permissions' })
  permissions: {
    id: string;
    action: string;
    subject: string;
    storeId?: string;
  }[];

  @ApiProperty({ description: 'Parent role information' })
  parentRole?: {
    id: string;
    name: string;
  };

  @ApiProperty({ description: 'Creation metadata' })
  createdAt: Date;
  updatedAt: Date;
}

export class CheckPermissionDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Store ID' })
  @IsString()
  storeId: string;

  @ApiProperty({ description: 'Action to check' })
  @IsString()
  action: string;

  @ApiProperty({ description: 'Subject to check' })
  @IsString()
  subject: string;
}

export class PermissionCheckResponseDto {
  @ApiProperty({ description: 'Whether user has the permission' })
  hasPermission: boolean;

  @ApiProperty({ description: 'Reason for permission grant/denial' })
  reason: string;

  @ApiProperty({ description: 'User role information' })
  userRole?: {
    roleName: string;
    isStoreSpecific: boolean;
    isTenantSuperAdmin: boolean;
  };
}