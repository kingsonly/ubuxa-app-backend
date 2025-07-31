# Store Access Guard Documentation

## Overview

The `StoreAccessGuard` is a comprehensive NestJS guard that verifies whether a user has access to a specific store within a multi-tenant, multi-store system. It provides flexible configuration options and integrates seamlessly with the store roles and permissions system.

## Features

- **Flexible Store ID Extraction**: Automatically extracts store ID from parameters, query strings, request body, or store context
- **Tenant Super Admin Support**: Configurable bypass for tenant super administrators
- **Active Role Validation**: Ensures users have active role assignments
- **Comprehensive Logging**: Detailed logging for debugging and audit trails
- **Type-Safe Configuration**: Strongly typed configuration options
- **Multiple Convenience Decorators**: Pre-configured decorators for common use cases

## Basic Usage

### 1. Simple Store Access Check

```typescript
@Controller('stores')
@UseGuards(JwtAuthGuard) // Always authenticate first
export class StoresController {
  
  @Get(':storeId/inventory')
  @UseGuards(StoreAccessGuard)
  @RequireStoreAccess()
  async getStoreInventory(@Param('storeId') storeId: string) {
    // User has verified access to this store
    return this.inventoryService.getByStore(storeId);
  }
}
```

### 2. Custom Parameter Name

```typescript
@Get(':id/details')
@UseGuards(StoreAccessGuard)
@RequireStoreAccess({ storeIdParam: 'id' })
async getStoreDetails(@Param('id') id: string) {
  return this.storesService.getDetails(id);
}
```

### 3. Context-Based Access

```typescript
@Get('current-store/summary')
@UseGuards(StoreAccessGuard)
@RequireStoreAccessFromContext()
async getCurrentStoreSummary() {
  // Store ID comes from JWT token or headers
  return this.storesService.getSummary();
}
```

## Configuration Options

The `@RequireStoreAccess()` decorator accepts a configuration object:

```typescript
interface StoreAccessRequirement {
  storeIdParam?: string;           // Parameter name (default: 'storeId')
  allowTenantSuperAdmin?: boolean; // Allow super admin bypass (default: true)
  requireActiveRole?: boolean;     // Require active role (default: true)
  fallbackToContext?: boolean;     // Use store context fallback (default: true)
}
```

### Configuration Examples

```typescript
// Strict access - no super admin bypass
@RequireStoreAccess({ 
  allowTenantSuperAdmin: false 
})

// Include inactive roles
@RequireStoreAccess({ 
  requireActiveRole: false 
})

// Custom parameter with no context fallback
@RequireStoreAccess({ 
  storeIdParam: 'customStoreId',
  fallbackToContext: false 
})

// Complete custom configuration
@RequireStoreAccess({
  storeIdParam: 'targetStore',
  allowTenantSuperAdmin: false,
  requireActiveRole: true,
  fallbackToContext: false
})
```

## Convenience Decorators

Pre-configured decorators for common scenarios:

```typescript
// Standard store access by ID parameter
@RequireStoreAccessById()

// Store access using 'id' parameter
@RequireStoreAccessByIdParam()

// Context-only access (no parameters)
@RequireStoreAccessFromContext()

// Allow super admin bypass
@RequireStoreAccessWithSuperAdmin()

// Strict access (no super admin bypass)
@RequireStrictStoreAccess()

// Include inactive roles
@RequireStoreAccessIncludeInactive()
```

## Store ID Extraction Priority

The guard extracts store ID in the following order:

1. **Specified Parameter**: `request.params[storeIdParam]`
2. **Default Parameters**: `request.params.storeId` or `request.params.id`
3. **Query Parameters**: `request.query.storeId`
4. **Request Body**: `request.body.storeId`
5. **Store Context**: From JWT token or middleware (if `fallbackToContext: true`)

## Access Control Logic

### 1. Tenant Super Admin Check
```typescript
if (options.allowTenantSuperAdmin && userAccess.isTenantSuperAdmin) {
  return true; // Bypass store-specific checks
}
```

### 2. Store-Specific Access Check
```typescript
const hasAccess = userStoreRoles.some(role => {
  const isCorrectStore = role.store.id === storeId;
  const isActive = options.requireActiveRole ? role.isActive : true;
  const isRoleActive = role.storeRole?.active !== false;
  
  return isCorrectStore && isActive && isRoleActive;
});
```

## Error Handling

The guard throws specific exceptions:

- **`UnauthorizedException`**: User not authenticated
- **`ForbiddenException`**: No tenant context, store context, or access denied
- **Generic `ForbiddenException`**: Service errors or unexpected failures

## Integration with Other Guards

### With JWT Authentication
```typescript
@UseGuards(JwtAuthGuard, StoreAccessGuard)
@RequireStoreAccess()
```

### With Store Permissions
```typescript
@UseGuards(JwtAuthGuard, StoreAccessGuard, StorePermissionGuard)
@RequireStoreAccess()
@RequireStorePermission('read', 'StoreInventory')
```

### Multiple Guards Chain
```typescript
@UseGuards(JwtAuthGuard, TenantGuard, StoreAccessGuard, StorePermissionGuard)
@RequireStoreAccess()
@RequireStorePermission('manage', 'Store')
```

## Logging and Debugging

The guard provides comprehensive logging:

```typescript
// Debug logs (when access is granted)
this.logger.debug(`Store access granted: User ${userId} has access to store ${storeId}`);

// Warning logs (when access is denied)
this.logger.warn(`Store access denied: User ${userId} has no access to store ${storeId}`);

// Error logs (when service fails)
this.logger.error(`Store access check failed: ${error.message}`, error.stack);
```

## Best Practices

### 1. Always Authenticate First
```typescript
@UseGuards(JwtAuthGuard, StoreAccessGuard) // JWT first, then store access
```

### 2. Use Appropriate Configuration
```typescript
// For admin operations - strict access
@RequireStrictStoreAccess()

// For read operations - allow super admin
@RequireStoreAccessWithSuperAdmin()
```

### 3. Combine with Permission Guards
```typescript
// Check access first, then specific permissions
@UseGuards(JwtAuthGuard, StoreAccessGuard, StorePermissionGuard)
@RequireStoreAccess()
@RequireStorePermission('update', 'StoreInventory')
```

### 4. Handle Multiple Stores
```typescript
// For operations affecting multiple stores
@Post('batch-transfer')
@UseGuards(JwtAuthGuard) // Don't use StoreAccessGuard for batch operations
async batchTransfer(@Body() data: { transfers: StoreTransfer[] }) {
  // Validate access to each store in the service layer
  return this.transferService.batchTransfer(data.transfers);
}
```

## Testing

### Unit Testing
```typescript
describe('StoreAccessGuard', () => {
  it('should grant access for valid store role', async () => {
    // Mock user access data
    storeRolesService.getUserStoreAccess.mockResolvedValue({
      isTenantSuperAdmin: false,
      userStoreRoles: [{ store: { id: 'store-123' }, isActive: true }]
    });
    
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });
});
```

### Integration Testing
```typescript
describe('Store Access Integration', () => {
  it('should work with real controller', async () => {
    const response = await request(app)
      .get('/stores/store-123/inventory')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);
  });
});
```

## Common Patterns

### 1. Store Management Endpoints
```typescript
@Controller('stores')
export class StoresController {
  @Get(':storeId')
  @UseGuards(JwtAuthGuard, StoreAccessGuard)
  @RequireStoreAccess()
  async getStore(@Param('storeId') storeId: string) {
    return this.storesService.findOne(storeId);
  }
  
  @Put(':storeId')
  @UseGuards(JwtAuthGuard, StoreAccessGuard, StorePermissionGuard)
  @RequireStoreAccess()
  @RequireStorePermission('update', 'Store')
  async updateStore(@Param('storeId') storeId: string, @Body() data: UpdateStoreDto) {
    return this.storesService.update(storeId, data);
  }
}
```

### 2. Inventory Management
```typescript
@Controller('stores/:storeId/inventory')
export class StoreInventoryController {
  @Get()
  @UseGuards(JwtAuthGuard, StoreAccessGuard)
  @RequireStoreAccess()
  async getInventory(@Param('storeId') storeId: string) {
    return this.inventoryService.getByStore(storeId);
  }
  
  @Post()
  @UseGuards(JwtAuthGuard, StoreAccessGuard, StorePermissionGuard)
  @RequireStoreAccess()
  @RequireStorePermission('create', 'StoreInventory')
  async addInventory(@Param('storeId') storeId: string, @Body() data: CreateInventoryDto) {
    return this.inventoryService.create(storeId, data);
  }
}
```

### 3. Context-Based Operations
```typescript
@Controller('current-store')
export class CurrentStoreController {
  @Get('dashboard')
  @UseGuards(JwtAuthGuard, StoreAccessGuard)
  @RequireStoreAccessFromContext()
  async getDashboard() {
    // Store ID comes from JWT token
    return this.dashboardService.getCurrentStoreDashboard();
  }
}
```

## Migration from Simple Access Check

If you're upgrading from a simpler access check:

```typescript
// Before
@Get(':storeId/data')
async getData(@Param('storeId') storeId: string, @GetUser() user: User) {
  // Manual access check
  const hasAccess = await this.checkStoreAccess(user.id, storeId);
  if (!hasAccess) throw new ForbiddenException();
  
  return this.service.getData(storeId);
}

// After
@Get(':storeId/data')
@UseGuards(JwtAuthGuard, StoreAccessGuard)
@RequireStoreAccess()
async getData(@Param('storeId') storeId: string) {
  // Access automatically verified
  return this.service.getData(storeId);
}
```

This enhanced guard provides a robust, flexible, and maintainable solution for store access control in your multi-tenant, multi-store application.