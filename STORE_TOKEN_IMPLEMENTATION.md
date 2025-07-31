# Store ID in JWT Token Implementation

## Overview
This implementation adds store ID to JWT tokens, enabling automatic store context without requiring headers. The store ID is encrypted and included in the JWT payload alongside the tenant ID.

## Key Changes Made

### 1. Encryption Functions (`src/utils/encryptor.decryptor.ts`)
Added store-specific encryption/decryption functions:
- `encryptStoreId(storeId: string): string`
- `decryptStoreId(text: string): string | null`

### 2. Auth Service Updates (`src/auth/auth.service.ts`)

#### Login Method
- Queries user's store roles for the selected tenant
- Determines user's primary store (first active store role or main store fallback)
- Adds encrypted store ID to JWT payload as `store` property

#### Select Tenant Login Method
- Same logic as login method
- Includes user's store information in both token and response

#### JWT Payload Structure
```typescript
{
  sub: userId,
  tenant: encryptedTenantId,
  store: encryptedStoreId  // New field
}
```

### 3. Store Middleware Updates

#### Functional Middleware (`src/stores/middleware/store.middleware.ts`)
- Updated to extract store ID from JWT tokens using native `jsonwebtoken` library
- Maintains the functional middleware pattern used by the application

#### Injectable Middleware (`src/stores/middleware/store-context.middleware.ts`)
- Created as an alternative NestJS injectable middleware class
- Uses NestJS's `JwtService` for token verification
- Can be used if you prefer the class-based approach

#### Priority Order for Store ID Resolution
1. **Header**: `storeid` or `store-id` headers (highest priority)
2. **JWT Token**: Encrypted store ID from token payload
3. **Main Store**: Fallback to tenant's main store (handled by StoreContext)

#### New Functions
- `extractStoreIdFromToken(token: string): string | null`
- Enhanced middleware logic to extract from JWT

### 4. User Store Relationship
Uses the existing `UserStoreRole` model to determine which store a user belongs to:
- Queries active store roles for the user in the selected tenant
- Uses the first active store role as the primary store
- Falls back to main store if user has no specific store roles

## Usage Examples

### 1. Login Response
```json
{
  "user": {...},
  "access_token": "eyJ...",
  "tenant": {...},
  "store": {
    "id": "store-id",
    "name": "Company Name - Main Store",
    "type": "MAIN"
  }
}
```

### 2. Automatic Store Context
```typescript
@Injectable()
export class MyService {
  constructor(private readonly storeContext: StoreContext) {}

  async someMethod() {
    // Store ID is automatically available from token
    const storeId = await this.storeContext.requireStoreId();
    // No need to pass store ID in headers
  }
}
```

### 3. Manual Override
```bash
# Still works - header overrides token
curl -H "Authorization: Bearer <token>" \
     -H "storeid: different-store-id" \
     /api/products
```

## Benefits

1. **Seamless Experience**: Users don't need to manage store IDs manually
2. **Backward Compatible**: Headers still work and take priority
3. **Secure**: Store IDs are encrypted in the token
4. **Automatic Fallback**: Falls back to main store when appropriate
5. **Multi-Store Ready**: Supports users with roles in multiple stores

## Security Considerations

- Store IDs are encrypted using the same AES-256-CBC encryption as tenant IDs
- Token verification ensures only valid, non-tampered tokens are accepted
- Store access is still controlled by user store roles and permissions

## Alternative: Injectable Middleware

If you prefer to use NestJS's injectable middleware pattern, you can switch to `StoreContextMiddleware`:

```typescript
// In app.module.ts
import { StoreContextMiddleware } from './stores/middleware/store-context.middleware';

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(tenantMiddleware)
      .forRoutes("*");
    
    // Use injectable middleware instead
    consumer
      .apply(StoreContextMiddleware)
      .forRoutes("*");
  }
}
```

Make sure to import `JwtModule` in your `StoresModule` if using the injectable version:

```typescript
// In stores.module.ts
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET_KEY,
    }),
    // ... other imports
  ],
  // ...
})
export class StoresModule {}
```

## Migration Notes

- Existing tokens without store IDs will continue to work
- Store context will fall back to main store for users without specific store roles
- No breaking changes to existing API endpoints
- Headers still take priority over token-based store IDs
- Both functional and injectable middleware patterns are provided