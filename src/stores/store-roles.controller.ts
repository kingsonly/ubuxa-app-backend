import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  UseGuards,
  Req
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StoreRolesService } from './store-roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { StorePermissionGuard, RequireStoreAdmin, RequireStorePermission } from './guards/store-permission.guard';
import {
  CreateStoreRoleDto,
  UpdateStoreRoleDto,
  AssignUserToStoreDto,
  CreateStorePermissionDto,
  CheckPermissionDto,
  StoreRoleResponseDto,
  UserStoreAccessResponseDto,
  StoreUsersResponseDto,
  PermissionCheckResponseDto
} from './dto/store-roles.dto';

@ApiTags('Store Roles & Permissions')
@ApiBearerAuth()
@Controller('stores/roles')
@UseGuards(JwtAuthGuard)
export class StoreRolesController {
  constructor(private readonly storeRolesService: StoreRolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new store role' })
  @ApiResponse({ status: 201, description: 'Store role created successfully', type: StoreRoleResponseDto })
  @RequireStorePermission('manage', 'StoreUsers')
  @UseGuards(StorePermissionGuard)
  async createStoreRole(@Body() dto: CreateStoreRoleDto, @Req() req: any) {
    return this.storeRolesService.createStoreRole(dto, {
      tenantId: req.tenantId,
      userId: req.user.sub
    });
  }

  @Put(':roleId')
  @ApiOperation({ summary: 'Update a store role' })
  @ApiResponse({ status: 200, description: 'Store role updated successfully', type: StoreRoleResponseDto })
  @RequireStorePermission('manage', 'StoreUsers')
  @UseGuards(StorePermissionGuard)
  async updateStoreRole(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateStoreRoleDto,
    @Req() req: any
  ) {
    // Implementation would go here
    throw new Error('Not implemented yet');
  }

  @Post('assign-user')
  @ApiOperation({ summary: 'Assign a user to a store with a specific role' })
  @ApiResponse({ status: 201, description: 'User assigned to store successfully' })
  @RequireStorePermission('assign', 'StoreUsers')
  @UseGuards(StorePermissionGuard)
  async assignUserToStore(@Body() dto: AssignUserToStoreDto, @Req() req: any) {
    return this.storeRolesService.assignUserToStore(dto, {
      tenantId: req.tenantId,
      userId: req.user.sub
    });
  }

  @Delete('revoke-access/:userId/:storeId')
  @ApiOperation({ summary: 'Revoke user access to a store' })
  @ApiResponse({ status: 200, description: 'User access revoked successfully' })
  @RequireStorePermission('manage', 'StoreUsers')
  @UseGuards(StorePermissionGuard)
  async revokeUserStoreAccess(
    @Param('userId') userId: string,
    @Param('storeId') storeId: string,
    @Req() req: any
  ) {
    return this.storeRolesService.revokeUserStoreAccess(userId, storeId, {
      tenantId: req.tenantId,
      userId: req.user.sub
    });
  }

  @Get('user-access/:userId')
  @ApiOperation({ summary: 'Get user store access and permissions' })
  @ApiResponse({ status: 200, description: 'User store access retrieved', type: UserStoreAccessResponseDto })
  async getUserStoreAccess(@Param('userId') userId: string, @Req() req: any) {
    return this.storeRolesService.getUserStoreAccess({ userId }, {
      tenantId: req.tenantId
    });
  }

  @Get('accessible-stores/:userId')
  @ApiOperation({ summary: 'Get all stores a user has access to' })
  @ApiResponse({ status: 200, description: 'Accessible stores retrieved' })
  async getUserAccessibleStores(@Param('userId') userId: string, @Req() req: any) {
    return this.storeRolesService.getUserAccessibleStores(userId, {
      tenantId: req.tenantId
    });
  }

  @Get('store-users/:storeId')
  @ApiOperation({ summary: 'Get all users with access to a store' })
  @ApiResponse({ status: 200, description: 'Store users retrieved', type: StoreUsersResponseDto })
  @RequireStorePermission('read', 'StoreUsers', 'storeId')
  @UseGuards(StorePermissionGuard)
  async getStoreUsers(@Param('storeId') storeId: string, @Req() req: any) {
    return this.storeRolesService.getStoreUsers(storeId, {
      tenantId: req.tenantId
    });
  }

  @Post('check-permission')
  @ApiOperation({ summary: 'Check if user has specific permission for a store' })
  @ApiResponse({ status: 200, description: 'Permission check result', type: PermissionCheckResponseDto })
  async checkUserStorePermission(@Body() dto: CheckPermissionDto, @Req() req: any) {
    const hasPermission = await this.storeRolesService.checkUserStorePermission(
      dto.userId,
      dto.storeId,
      dto.action,
      dto.subject,
      { tenantId: req.tenantId }
    );

    return {
      hasPermission,
      reason: hasPermission ? 'Permission granted' : 'Permission denied',
      userRole: null // Could be enhanced to return role details
    };
  }

  @Post('permissions')
  @ApiOperation({ summary: 'Create a new store permission' })
  @ApiResponse({ status: 201, description: 'Store permission created successfully' })
  @RequireStorePermission('manage', 'StoreUsers')
  @UseGuards(StorePermissionGuard)
  async createStorePermission(@Body() dto: CreateStorePermissionDto, @Req() req: any) {
    // Implementation would go here
    throw new Error('Not implemented yet');
  }

  @Get('my-stores')
  @ApiOperation({ summary: 'Get stores the current user has access to' })
  @ApiResponse({ status: 200, description: 'User accessible stores retrieved' })
  async getMyStores(@Req() req: any) {
    return this.storeRolesService.getUserAccessibleStores(req.user.sub, {
      tenantId: req.tenantId
    });
  }

  @Get('my-permissions/:storeId')
  @ApiOperation({ summary: 'Get current user permissions for a specific store' })
  @ApiResponse({ status: 200, description: 'User store permissions retrieved' })
  async getMyStorePermissions(@Param('storeId') storeId: string, @Req() req: any) {
    return this.storeRolesService.getUserStoreAccess(
      { userId: req.user.sub, storeId },
      { tenantId: req.tenantId }
    );
  }
}