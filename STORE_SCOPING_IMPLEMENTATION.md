# Store Scoping Implementation Guide

## Overview

This guide demonstrates how to implement comprehensive store scoping across your entire NestJS application, similar to how tenant scoping works. With store scoping, all operations are automatically filtered and scoped to the current user's store context.

## Core Concepts

### 1. Store Context Pattern
Just like tenant context, store context provides automatic scoping:

```typescript
// Before (manual store filtering)
const products = await this.prisma.product.findMany({
  where: {
    tenantId: userTenantId,
    storeId: userStoreId, // Manual store filtering
  }
});

// After (automatic store scoping)
const products = await this.prisma.product.findMany({
  where: {
    tenantId: this.tenantContext.requireTenantId(),
    storeId: await this.storeContext.requireStoreId(), // Automatic from context
  }
});
```

### 2. Service Layer Pattern

Every service should follow this pattern:

```typescript
@Injectable()
export class StoreXxxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext, // ✅ Add store context
  ) {}

  async someMethod() {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId(); // ✅ Get store context

    return this.prisma.someModel.findMany({
      where: {
        tenantId,
        storeId, // ✅ Always include store scoping
      }
    });
  }
}
```

## Implementation Steps

### Step 1: Update Database Schema

Ensure all relevant models have `storeId` field:

```prisma
model Product {
  id       String @id @default(auto()) @map("_id") @db.ObjectId
  name     String
  tenantId String @db.ObjectId
  storeId  String @db.ObjectId // ✅ Add store reference
  
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  store    Store  @relation(fields: [storeId], references: [id])
  
  @@map("products")
}

model Contract {
  id       String @id @default(auto()) @map("_id") @db.ObjectId
  tenantId String @db.ObjectId
  storeId  String @db.ObjectId // ✅ Add store reference
  
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  store    Store  @relation(fields: [storeId], references: [id])
  
  @@map("contracts")
}

// Apply to all business models: Sales, Customers, Inventory, etc.
```

### Step 2: Create Store-Scoped Services

For each existing service, create a store-scoped version:

```typescript
// src/products/store-products.service.ts
@Injectable()
export class StoreProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
  ) {}

  async create(dto: CreateProductDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return this.prisma.product.create({
      data: {
        ...dto,
        tenantId,
        storeId, // ✅ Automatic store scoping
      }
    });
  }

  async findAll() {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return this.prisma.product.findMany({
      where: {
        tenantId,
        storeId, // ✅ Automatic store filtering
      }
    });
  }
}
```

### Step 3: Update Controllers with Store Guards

```typescript
@Controller('store/products')
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class StoreProductsController {
  constructor(private readonly storeProductsService: StoreProductsService) {}

  @Get()
  @RequireStoreAccess()
  async findAll() {
    // Store context automatically available
    return this.storeProductsService.findAll();
  }

  @Post()
  @RequireStoreAccess()
  @RequireStorePermission('create', 'Product')
  async create(@Body() dto: CreateProductDto) {
    return this.storeProductsService.create(dto);
  }
}
```

### Step 4: Handle Cross-Store Relationships

For models that reference other store-scoped entities:

```typescript
async createSale(dto: CreateSaleDto) {
  const tenantId = this.tenantContext.requireTenantId();
  const storeId = await this.storeContext.requireStoreId();

  // Validate that products belong to current store
  const products = await this.prisma.product.findMany({
    where: {
      id: { in: dto.productIds },
      tenantId,
      storeId, // ✅ Ensure products are from current store
    }
  });

  if (products.length !== dto.productIds.length) {
    throw new BadRequestException('Some products not found in current store');
  }

  return this.prisma.sale.create({
    data: {
      ...dto,
      tenantId,
      storeId, // ✅ Sale belongs to current store
    }
  });
}
```

## Service Examples

### 1. Store-Scoped Inventory Service

```typescript
@Injectable()
export class StoreInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
  ) {}

  async getInventory() {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return this.prisma.storeInventory.findMany({
      where: {
        tenantId,
        storeId,
      },
      include: {
        inventory: true,
        batches: true,
      }
    });
  }

  async transferToStore(targetStoreId: string, items: TransferItem[]) {
    const tenantId = this.tenantContext.requireTenantId();
    const sourceStoreId = await this.storeContext.requireStoreId();

    // Validate user has access to target store
    const hasTargetAccess = await this.storeRolesService.checkUserStorePermission(
      userId,
      targetStoreId,
      'receive',
      'StoreInventory'
    );

    if (!hasTargetAccess) {
      throw new ForbiddenException('No access to target store');
    }

    // Create transfer record
    return this.prisma.storeTransfer.create({
      data: {
        fromStoreId: sourceStoreId,
        toStoreId: targetStoreId,
        tenantId,
        items: {
          create: items.map(item => ({
            ...item,
            tenantId,
          }))
        }
      }
    });
  }
}
```

### 2. Store-Scoped Customer Service

```typescript
@Injectable()
export class StoreCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
  ) {}

  async getCustomers() {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return this.prisma.customer.findMany({
      where: {
        tenantId,
        // Customers who have made purchases in this store
        sales: {
          some: {
            storeId,
          }
        }
      },
      include: {
        sales: {
          where: {
            storeId, // Only sales from current store
          }
        }
      }
    });
  }

  async createCustomer(dto: CreateCustomerDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return this.prisma.customer.create({
      data: {
        ...dto,
        tenantId,
        // Associate with current store through first interaction
        firstStoreId: storeId,
      }
    });
  }
}
```

### 3. Store-Scoped Sales Service

```typescript
@Injectable()
export class StoreSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
  ) {}

  async createSale(dto: CreateSaleDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return this.prisma.$transaction(async (tx) => {
      // Create sale
      const sale = await tx.sale.create({
        data: {
          ...dto,
          tenantId,
          storeId, // ✅ Sale belongs to current store
        }
      });

      // Update store inventory
      for (const item of dto.items) {
        await tx.storeInventory.update({
          where: {
            inventoryId_storeId: {
              inventoryId: item.inventoryId,
              storeId,
            }
          },
          data: {
            quantity: {
              decrement: item.quantity
            }
          }
        });
      }

      return sale;
    });
  }

  async getSales(query: PaginationQueryDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId();

    return this.prisma.sale.findMany({
      where: {
        tenantId,
        storeId, // ✅ Only sales from current store
      },
      include: {
        customer: true,
        saleItems: {
          include: {
            product: {
              where: {
                storeId, // ✅ Only products from current store
              }
            }
          }
        },
        store: {
          select: {
            id: true,
            name: true,
            type: true,
          }
        }
      }
    });
  }
}
```

## Controller Patterns

### 1. Store-Specific Routes

```typescript
// Store-scoped routes
@Controller('store')
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class StoreController {
  
  @Get('products')
  @RequireStoreAccess()
  async getProducts() {
    return this.storeProductsService.findAll();
  }

  @Get('inventory')
  @RequireStoreAccess()
  @RequireStorePermission('read', 'StoreInventory')
  async getInventory() {
    return this.storeInventoryService.getInventory();
  }

  @Get('sales')
  @RequireStoreAccess()
  @RequireStorePermission('read', 'Sales')
  async getSales() {
    return this.storeSalesService.getSales();
  }
}
```

### 2. Multi-Store Operations

```typescript
// Operations that work across stores (for super admins)
@Controller('admin/stores')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MultiStoreController {
  
  @Get(':storeId/products')
  @RequireStoreAccess({ storeIdParam: 'storeId' })
  async getStoreProducts(@Param('storeId') storeId: string) {
    // Store context automatically set to storeId parameter
    return this.storeProductsService.findAll();
  }

  @Post('transfer')
  @RequireStorePermission('transfer', 'StoreInventory')
  async transferBetweenStores(@Body() dto: StoreTransferDto) {
    return this.storeInventoryService.transferToStore(
      dto.targetStoreId,
      dto.items
    );
  }
}
```

## Module Configuration

Update your modules to include store context:

```typescript
@Module({
  imports: [
    PrismaModule,
    TenantsModule,
    StoresModule, // ✅ Import stores module for context
  ],
  providers: [
    ProductsService, // Original service
    StoreProductsService, // ✅ Store-scoped service
    ContractService, // Original service
    StoreContractService, // ✅ Store-scoped service
  ],
  controllers: [
    ProductsController, // Original controller
    StoreProductsController, // ✅ Store-scoped controller
  ],
  exports: [
    ProductsService,
    StoreProductsService, // ✅ Export both versions
  ]
})
export class ProductsModule {}
```

## Migration Strategy

### Phase 1: Add Store Fields to Schema
1. Add `storeId` fields to all relevant models
2. Run database migration
3. Populate existing records with main store ID

### Phase 2: Create Store-Scoped Services
1. Create store-scoped versions of existing services
2. Implement store context injection
3. Add store filtering to all queries

### Phase 3: Update Controllers
1. Add store access guards
2. Create store-specific routes
3. Update existing routes to use store context

### Phase 4: Test and Deploy
1. Test store isolation
2. Verify cross-store operations
3. Deploy with feature flags

## Best Practices

### 1. Always Use Context
```typescript
// ❌ Don't hardcode store IDs
const products = await this.prisma.product.findMany({
  where: { storeId: 'hardcoded-id' }
});

// ✅ Use store context
const storeId = await this.storeContext.requireStoreId();
const products = await this.prisma.product.findMany({
  where: { storeId }
});
```

### 2. Validate Cross-Store References
```typescript
// ✅ Always validate related entities belong to current store
async createSale(dto: CreateSaleDto) {
  const storeId = await this.storeContext.requireStoreId();
  
  // Validate products belong to current store
  const products = await this.prisma.product.findMany({
    where: {
      id: { in: dto.productIds },
      storeId,
    }
  });
  
  if (products.length !== dto.productIds.length) {
    throw new BadRequestException('Invalid products for current store');
  }
}
```

### 3. Handle Store Transfers Carefully
```typescript
// ✅ Require explicit permissions for cross-store operations
async transferInventory(targetStoreId: string, items: TransferItem[]) {
  const sourceStoreId = await this.storeContext.requireStoreId();
  
  // Check permissions for both stores
  await this.validateStoreTransferPermissions(sourceStoreId, targetStoreId);
  
  return this.createTransfer(sourceStoreId, targetStoreId, items);
}
```

### 4. Provide Store Context in Responses
```typescript
// ✅ Include store context in API responses
return {
  data: products,
  meta: {
    storeId: await this.storeContext.requireStoreId(),
    storeName: store.name,
    total: products.length,
  }
};
```

## Testing Store Scoping

```typescript
describe('Store Scoping', () => {
  it('should only return products from current store', async () => {
    // Mock store context
    jest.spyOn(storeContext, 'requireStoreId').mockResolvedValue('store-123');
    
    const products = await service.findAll();
    
    // Verify all products belong to the store
    products.forEach(product => {
      expect(product.storeId).toBe('store-123');
    });
  });

  it('should prevent access to other store data', async () => {
    jest.spyOn(storeContext, 'requireStoreId').mockResolvedValue('store-123');
    
    // Try to access product from different store
    await expect(
      service.findOne('product-from-store-456')
    ).rejects.toThrow('Product not found');
  });
});
```

This comprehensive store scoping implementation ensures that your entire application respects store boundaries while maintaining the flexibility for cross-store operations when properly authorized.