# Complete Store Scoping System

## Overview

This document provides a comprehensive overview of the complete store scoping system implementation. The system automatically scopes all operations to the user's current store context, similar to how tenant scoping works, but at the store level.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Request Flow                             │
├─────────────────────────────────────────────────────────────────┤
│ 1. JWT Token (with encrypted storeId)                          │
│ 2. Store Middleware (extracts storeId)                         │
│ 3. Store Context (provides storeId to services)                │
│ 4. Store Access Guard (validates store access)                 │
│ 5. Store Permission Guard (validates specific permissions)     │
│ 6. Store-Scoped Services (automatic store filtering)           │
│ 7. Database Operations (scoped to store)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Store Context System

#### Store Context (`src/stores/context/store.context.ts`)
```typescript
@Injectable({ scope: Scope.REQUEST })
export class StoreContext {
  getStoreId(): string | null
  async requireStoreId(): Promise<string>
  requireStoreIdSync(): string
}
```

#### Store Middleware (`src/stores/middleware/store.middleware.ts`)
- Extracts store ID from JWT token
- Sets store context in request
- Priority: Headers > JWT Token > Main Store fallback

### 2. Authentication & Authorization

#### JWT Token Structure
```typescript
{
  sub: userId,
  tenant: encryptedTenantId,
  store: encryptedStoreId  // ✅ Store ID in token
}
```

#### Store Access Guard (`src/stores/guards/store-access.guard.ts`)
- Validates user has access to the store
- Supports tenant super admin bypass
- Flexible store ID extraction
- Comprehensive logging

#### Store Permission Guard (`src/stores/guards/store-permission.guard.ts`)
- Fine-grained permission checking
- Action + Subject based permissions
- Store-specific permission validation

### 3. Service Layer Architecture

#### Store-Scoped Services Pattern
```typescript
@Injectable()
export class StoreXxxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext, // ✅ Store context injection
  ) {}

  async someMethod() {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = await this.storeContext.requireStoreId(); // ✅ Automatic store scoping

    return this.prisma.someModel.findMany({
      where: {
        tenantId,
        storeId, // ✅ Always include store filter
      }
    });
  }
}
```

## Implementation Examples

### 1. Store-Scoped Products Service

**File**: `src/products/store-products.service.ts`

**Key Features**:
- All products scoped to current store
- Store-specific inventory validation
- Store-aware category management
- Automatic store ID injection

**Example Methods**:
```typescript
async create(dto: CreateProductDto) {
  const storeId = await this.storeContext.requireStoreId();
  // Validates inventories exist in current store
  // Creates product with store scoping
}

async getAllProducts() {
  const storeId = await this.storeContext.requireStoreId();
  // Returns only products from current store
  // Includes store-specific inventory data
}
```

### 2. Store-Scoped Contract Service

**File**: `src/contract/store-contract.service.ts`

**Key Features**:
- Contracts scoped to current store
- Store-specific sales relationships
- Cross-store validation
- Store-aware search functionality

**Example Methods**:
```typescript
async createContract(dto: CreateSalesDto) {
  const storeId = await this.storeContext.requireStoreId();
  // Creates contract for current store
  // Validates related entities belong to store
}

async getAllContracts() {
  const storeId = await this.storeContext.requireStoreId();
  // Returns contracts with sales in current store
  // Includes store-specific relationships
}
```

### 3. Store-Scoped Controller

**File**: `src/products/store-products.controller.ts`

**Key Features**:
- Store access validation on all endpoints
- Permission-based authorization
- Automatic store context injection
- Store-specific error handling

**Example Routes**:
```typescript
@Controller('store/products')
@UseGuards(JwtAuthGuard, StoreAccessGuard)
export class StoreProductsController {
  
  @Get()
  @RequireStoreAccess()
  @RequireStorePermission('read', 'Product')
  async findAll() {
    // Automatically scoped to current store
  }

  @Post()
  @RequireStoreAccess()
  @RequireStorePermission('create', 'Product')
  async create(@Body() dto: CreateProductDto) {
    // Creates product in current store
  }
}
```

## Database Schema Considerations

### Store-Scoped Models
All business models should include store references:

```prisma
model Product {
  id       String @id @default(auto()) @map("_id") @db.ObjectId
  name     String
  tenantId String @db.ObjectId
  storeId  String @db.ObjectId // ✅ Store reference
  
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  store    Store  @relation(fields: [storeId], references: [id])
}

model Sale {
  id       String @id @default(auto()) @map("_id") @db.ObjectId
  tenantId String @db.ObjectId
  storeId  String @db.ObjectId // ✅ Store reference
  
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  store    Store  @relation(fields: [storeId], references: [id])
}
```

### Cross-Store Relationships
Handle relationships that span stores:

```prisma
model StoreTransfer {
  id          String @id @default(auto()) @map("_id") @db.ObjectId
  fromStoreId String @db.ObjectId
  toStoreId   String @db.ObjectId
  tenantId    String @db.ObjectId
  
  fromStore   Store @relation("TransferFrom", fields: [fromStoreId], references: [id])
  toStore     Store @relation("TransferTo", fields: [toStoreId], references: [id])
  tenant      Tenant @relation(fields: [tenantId], references: [id])
}
```

## API Usage Examples

### 1. Basic Store Operations

```bash
# Get products from current store (store ID from JWT token)
curl -H "Authorization: Bearer <token>" \
     GET /api/store/products

# Create product in current store
curl -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"name":"Product Name","categoryId":"cat-123"}' \
     POST /api/store/products

# Override store context with header
curl -H "Authorization: Bearer <token>" \
     -H "storeid: different-store-id" \
     GET /api/store/products
```

### 2. Cross-Store Operations (Admin)

```bash
# Get products from specific store (admin operation)
curl -H "Authorization: Bearer <admin-token>" \
     GET /api/admin/stores/store-123/products

# Transfer inventory between stores
curl -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{"targetStoreId":"store-456","items":[...]}' \
     POST /api/admin/stores/transfer
```

## Security Model

### 1. Store Access Levels

```typescript
// Tenant Super Admin - Access to all stores
{
  isTenantSuperAdmin: true,
  userStoreRoles: [...] // All store roles
}

// Store Admin - Access to specific store(s)
{
  isTenantSuperAdmin: false,
  userStoreRoles: [
    {
      store: { id: "store-123" },
      storeRole: { name: "Store Admin" },
      isActive: true
    }
  ]
}

// Store Staff - Limited access to specific store
{
  isTenantSuperAdmin: false,
  userStoreRoles: [
    {
      store: { id: "store-123" },
      storeRole: { name: "Store Staff" },
      isActive: true
    }
  ]
}
```

### 2. Permission Matrix

| Role | Store Access | Product CRUD | Inventory Manage | Transfer | Reports |
|------|-------------|--------------|------------------|----------|---------|
| Tenant Super Admin | All Stores | ✅ | ✅ | ✅ | ✅ |
| Store Admin | Own Store | ✅ | ✅ | ✅ | ✅ |
| Store Manager | Own Store | ✅ | ✅ | ❌ | ✅ |
| Store Staff | Own Store | Read Only | Read Only | ❌ | ❌ |

## Error Handling

### Store-Specific Errors

```typescript
// Store not found
throw new ForbiddenException('Store context not found');

// No store access
throw new ForbiddenException('Access denied to store store-123');

// Product not in store
throw new NotFoundException('Product not found in this store');

// Cross-store validation error
throw new BadRequestException('Invalid products for current store');
```

### Error Response Format

```json
{
  "statusCode": 403,
  "message": "Access denied to store store-123",
  "error": "Forbidden",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "path": "/api/store/products",
  "storeId": "store-123"
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe('Store Scoping', () => {
  beforeEach(() => {
    jest.spyOn(storeContext, 'requireStoreId')
        .mockResolvedValue('store-123');
  });

  it('should only return store-scoped data', async () => {
    const products = await service.getAllProducts();
    
    products.forEach(product => {
      expect(product.storeId).toBe('store-123');
    });
  });

  it('should prevent cross-store access', async () => {
    await expect(
      service.getProduct('product-from-different-store')
    ).rejects.toThrow('Product not found in this store');
  });
});
```

### 2. Integration Tests

```typescript
describe('Store API Integration', () => {
  it('should scope products to user store', async () => {
    const response = await request(app)
      .get('/store/products')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body.storeId).toBe(userStoreId);
    response.body.products.forEach(product => {
      expect(product.storeId).toBe(userStoreId);
    });
  });
});
```

## Performance Considerations

### 1. Database Indexing

```sql
-- Compound indexes for store-scoped queries
CREATE INDEX idx_products_tenant_store ON products(tenantId, storeId);
CREATE INDEX idx_sales_tenant_store ON sales(tenantId, storeId);
CREATE INDEX idx_inventory_tenant_store ON store_inventory(tenantId, storeId);
```

### 2. Query Optimization

```typescript
// ✅ Efficient store-scoped query
const products = await this.prisma.product.findMany({
  where: {
    tenantId,
    storeId, // Uses compound index
  },
  select: {
    id: true,
    name: true,
    // Only select needed fields
  }
});

// ❌ Avoid N+1 queries
const products = await this.prisma.product.findMany({
  where: { tenantId, storeId },
  include: {
    inventories: {
      where: { storeId }, // Include store filter in relations
    }
  }
});
```

## Migration Strategy

### Phase 1: Schema Updates
1. Add `storeId` fields to all business models
2. Create database migrations
3. Populate existing records with main store ID

### Phase 2: Service Layer
1. Create store-scoped service versions
2. Implement store context injection
3. Add store filtering to all queries

### Phase 3: API Layer
1. Add store access guards
2. Create store-specific controllers
3. Update existing endpoints

### Phase 4: Testing & Deployment
1. Comprehensive testing of store isolation
2. Performance testing with store indexes
3. Gradual rollout with feature flags

## Benefits

### 1. **Automatic Store Isolation**
- All operations automatically scoped to user's store
- No manual store ID management required
- Prevents accidental cross-store data access

### 2. **Flexible Access Control**
- Fine-grained permissions per store
- Support for multi-store users
- Tenant super admin capabilities

### 3. **Scalable Architecture**
- Clean separation of concerns
- Reusable patterns across services
- Easy to extend to new business models

### 4. **Security by Default**
- Store boundaries enforced at multiple layers
- Encrypted store IDs in tokens
- Comprehensive audit logging

### 5. **Developer Experience**
- Consistent patterns across the application
- Type-safe store context injection
- Clear error messages and debugging

This complete store scoping system provides enterprise-level multi-store capabilities while maintaining security, performance, and developer productivity.