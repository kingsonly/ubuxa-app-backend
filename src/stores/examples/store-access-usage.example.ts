import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { 
  StoreAccessGuard, 
  RequireStoreAccess, 
  RequireStoreAccessById,
  RequireStoreAccessByIdParam,
  RequireStoreAccessFromContext,
  RequireStoreAccessWithSuperAdmin,
  RequireStrictStoreAccess
} from '../guards/store-access.guard';

@ApiTags('Store Access Examples')
@ApiBearerAuth()
@Controller('stores')
@UseGuards(JwtAuthGuard) // Always require authentication first
export class StoreAccessExampleController {

  /**
   * Example 1: Basic store access using default settings
   * - Extracts store ID from 'storeId' parameter
   * - Allows tenant super admin access
   * - Requires active role
   */
  @Get(':storeId/basic')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccess()
  @ApiOperation({ summary: 'Basic store access example' })
  async basicStoreAccess(@Param('storeId') storeId: string) {
    return { message: `Access granted to store ${storeId}` };
  }

  /**
   * Example 2: Store access with custom parameter name
   * - Extracts store ID from 'id' parameter instead of 'storeId'
   */
  @Get(':id/by-id')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccessByIdParam()
  @ApiOperation({ summary: 'Store access using id parameter' })
  async storeAccessById(@Param('id') id: string) {
    return { message: `Access granted to store ${id}` };
  }

  /**
   * Example 3: Store access from context only
   * - No parameter extraction, relies on store context
   * - Useful when store ID is set via middleware/headers
   */
  @Get('context-only')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccessFromContext()
  @ApiOperation({ summary: 'Store access from context only' })
  async storeAccessFromContext() {
    return { message: 'Access granted based on store context' };
  }

  /**
   * Example 4: Strict store access (no super admin bypass)
   * - Tenant super admin must have explicit store role
   */
  @Post(':storeId/strict')
  @UseGuards(StoreAccessGuard)
  @RequireStrictStoreAccess()
  @ApiOperation({ summary: 'Strict store access without super admin bypass' })
  async strictStoreAccess(@Param('storeId') storeId: string, @Body() data: any) {
    return { message: `Strict access granted to store ${storeId}`, data };
  }

  /**
   * Example 5: Custom store access configuration
   * - Custom parameter name
   * - Include inactive roles
   * - No tenant super admin bypass
   */
  @Put(':customStoreId/custom')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccess({
    storeIdParam: 'customStoreId',
    allowTenantSuperAdmin: false,
    requireActiveRole: false,
    fallbackToContext: false
  })
  @ApiOperation({ summary: 'Custom store access configuration' })
  async customStoreAccess(@Param('customStoreId') customStoreId: string, @Body() data: any) {
    return { message: `Custom access granted to store ${customStoreId}`, data };
  }

  /**
   * Example 6: Multiple guards combination
   * - First checks store access, then specific permissions
   */
  @Delete(':storeId/admin-only')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccessWithSuperAdmin()
  @ApiOperation({ summary: 'Store access with super admin privileges' })
  async adminOnlyAccess(@Param('storeId') storeId: string) {
    return { message: `Admin access granted to store ${storeId}` };
  }

  /**
   * Example 7: Store access with query parameter fallback
   * - Tries parameter first, then query, then context
   */
  @Get('flexible-access')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccess({
    storeIdParam: 'storeId',
    fallbackToContext: true
  })
  @ApiOperation({ summary: 'Flexible store access with multiple sources' })
  async flexibleAccess() {
    return { message: 'Flexible access granted' };
  }

  /**
   * Example 8: Store access for batch operations
   * - Access check for operations affecting multiple stores
   */
  @Post('batch-operation')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccessFromContext()
  @ApiOperation({ summary: 'Batch operation with store access' })
  async batchOperation(@Body() data: { storeIds: string[], operation: string }) {
    // Note: This guard only checks access to the context store
    // For multiple stores, you'd need additional logic in the service
    return { message: 'Batch operation authorized', data };
  }
}

/**
 * Usage Notes:
 * 
 * 1. Always use JwtAuthGuard before StoreAccessGuard
 * 2. The guard will automatically extract store ID from various sources
 * 3. Tenant super admins bypass store-specific checks by default
 * 4. Use strict access when you need explicit store role assignment
 * 5. The guard logs access attempts for debugging
 * 6. Combine with StorePermissionGuard for fine-grained permissions
 * 
 * Common Patterns:
 * 
 * // Basic usage
 * @UseGuards(JwtAuthGuard, StoreAccessGuard)
 * @RequireStoreAccess()
 * 
 * // With specific permissions
 * @UseGuards(JwtAuthGuard, StoreAccessGuard, StorePermissionGuard)
 * @RequireStoreAccess()
 * @RequireStorePermission('read', 'StoreInventory')
 * 
 * // Strict access only
 * @UseGuards(JwtAuthGuard, StoreAccessGuard)
 * @RequireStrictStoreAccess()
 */