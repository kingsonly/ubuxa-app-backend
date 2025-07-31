# Store Context Usage

## Overview
The Store Context system provides automatic store scoping for all operations, similar to how Tenant Context works. Every request can be scoped to a specific store, with automatic fallback to the main store if no store is specified.

## How it Works

### 1. Store Context Injection
```typescript
import { StoreContext } from './context/store.context';

@Injectable()
export class MyService {
  constructor(private readonly storeContext: StoreContext) {}

  async someMethod() {
    // Get store ID (returns null if not set)
    const storeId = this.storeContext.getStoreId();
    
    // Require store ID (throws if not found, tries main store as fallback)
    const storeId = await this.storeContext.requireStoreId();
    
    // Synchronous version (no main store fallback)
    const storeId = this.storeContext.requireStoreIdSync();
  }
}
```

### 2. Setting Store Context
Store context can be set via HTTP headers:

```bash
# Using storeid header
curl -H "storeid: 64f8a1b2c3d4e5f6a7b8c9d0" /api/products

# Using store-id header (alternative)
curl -H "store-id: 64f8a1b2c3d4e5f6a7b8c9d0" /api/products
```

### 3. Automatic Main Store Fallback
If no store ID is provided in headers, the system will automatically:
1. Look for the main store of the current tenant
2. Use that store ID for the request
3. Cache it in the request context for subsequent calls

### 4. Login Response
When users log in, they now receive store information:

```json
{
  "user": { ... },
  "access_token": "...",
  "tenant": { ... },
  "store": {
    "id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "name": "Company Name - Main Store",
    "type": "MAIN"
  }
}
```

## Integration with Services

### Updated Service Methods
All store-related services now support optional context parameters:

```typescript
// These methods now work with or without explicit context
await storesService.listStores(); // Uses context automatically
await storesService.getStore(id); // Uses tenant context automatically
await storesService.createStore(dto); // Uses both tenant and store context

// You can still pass explicit context if needed
await storesService.listStores({ tenantId: 'specific-tenant' });
```

### Tenant Creation
When a tenant is created, a main store is automatically created:

```typescript
const result = await tenantsService.createTenant(dto);
// result.mainStore contains the automatically created main store
```

## Multi-Store Support

### Store Hierarchy
- **MAIN**: Root store (one per tenant)
- **REGIONAL**: Child of main store
- **SUB_REGIONAL**: Child of regional store

### Store Context in Multi-Store Environment
In multi-store setups, users can switch between stores by sending different store IDs in headers. The system maintains proper isolation and access control.

## Best Practices

1. **Always use context methods**: Don't manually extract store IDs from requests
2. **Handle async context**: Use `await this.storeContext.requireStoreId()` when you need guaranteed store access
3. **Graceful fallbacks**: The system automatically falls back to main store when possible
4. **Header consistency**: Use `storeid` header for consistency across the application

## Migration Notes

Existing services have been updated to support both explicit context parameters and automatic context injection. This ensures backward compatibility while enabling the new store context features.