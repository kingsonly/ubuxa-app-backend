# Multi-Store System Architecture

## Overview

The Ubuxa Energy Platform implements a sophisticated multi-store system that allows a single business tenant to operate multiple physical locations with centralized oversight and distributed inventory management. This document outlines the architectural patterns, security measures, and implementation details of the multi-store functionality.

## Core Architecture Pattern

### Hierarchical Store Structure

The multi-store system follows a strict three-tier hierarchy:

```
Main Store (Root Level)
├── Regional Store 1
│   ├── Sub-Regional Store 1A
│   └── Sub-Regional Store 1B
└── Regional Store 2
    ├── Sub-Regional Store 2A
    └── Sub-Regional Store 2B
```

**Store Types & Responsibilities:**

1. **Main Store (Root Level)**
   - Central authority and inventory source
   - Super admin access to all warehouses
   - Creates inventory items and products
   - Distributes to any warehouse in the network
   - Access to all other store data

2. **Regional Store (Mid Level)**
   - Manages specific geographic regions
   - Distributes to sub-regional stores within region only
   - Cannot create inventory items/products
   - Can request from main store or other regional stores

3. **Sub-Regional Store (Leaf Level)**
   - Lowest hierarchy level
   - Distributes within region only (upon receiving requests)
   - Cannot create inventory items/products
   - Can request from regional store or main store

## Data Architecture

### Core Models

#### Store Entity
```typescript
{
  id: string
  name: string
  type: StoreType // MAIN, REGIONAL, SUB_REGIONAL
  tenantId: string
  parentId?: string
  isActive: boolean
  region?: string
  configuration: StoreConfiguration
}
```

#### Store Inventory
```typescript
{
  storeId: string
  inventoryId: string
  quantity: number
  reservedQuantity: number
  minimumThreshold?: number
  maximumThreshold?: number
  rootSourceStoreId: string // Always main store
}
```

#### Store Transfer
```typescript
{
  transferNumber: string
  fromStoreId: string
  toStoreId: string
  inventoryId: string
  quantity: number
  transferType: TransferType
  status: TransferStatus
  requestId?: string
  approvalWorkflow: WorkflowTracking
}
```

#### Store Request
```typescript
{
  requestNumber: string
  fromStoreId: string // Requesting store
  toStoreId: string   // Store being requested from
  inventoryId: string
  requestedQuantity: number
  approvedQuantity?: number
  status: RequestStatus
  priority: RequestPriority
  justification?: string
}
```

### Database Design Patterns

#### 1. Hierarchical Relationships
- **Self-referencing**: `Store.parentId` → `Store.id`
- **Constraint**: Regional stores can only have main store as parent
- **Cascade Rules**: Restrict deletion if children exist

#### 2. Root Source Tracking
- **Pattern**: Every inventory item traces back to main store
- **Implementation**: `StoreInventory.rootSourceStoreId` always points to main store
- **Purpose**: Audit trail and inventory accountability

#### 3. Multi-Tenancy Integration
- **Scope**: All store operations tenant-isolated
- **Enforcement**: Every query includes `tenantId` filter
- **Security**: Cross-tenant data leakage prevention

## Security Architecture

### Access Control Layers

#### 1. Tenant Isolation
```typescript
// Every operation scoped to tenant
where: { tenantId: userContext.tenantId }
```

#### 2. Store Hierarchy Authorization
```typescript
// StoreAccessGuard implementation
class StoreAccessGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Validate user's store assignments
    // Check hierarchical access permissions
    // Enforce store-type restrictions
  }
}
```

#### 3. Role-Based Access Control (RBAC)
```typescript
@RolesAndPermissions({ 
  permissions: ['write:Inventory'],
  storeAccess: { 
    requireStoreAccess: true,
    allowedStoreTypes: [StoreType.MAIN, StoreType.REGIONAL]
  }
})
```

### Permission Matrix

| Store Type | Create Inventory | Transfer Out | Transfer In | Request | Approve Requests |
|------------|------------------|--------------|-------------|---------|------------------|
| Main       | ✅ Yes           | ✅ All       | ✅ All      | ✅ All  | ✅ All           |
| Regional   | ❌ No            | ✅ Children  | ✅ All      | ✅ Up   | ✅ Children      |
| Sub-Reg    | ❌ No            | ✅ Siblings  | ✅ All      | ✅ Up   | ❌ No            |

### Business Rule Enforcement

#### 1. Hierarchy Validation
```typescript
private async validateStoreHierarchy(
  fromStoreId: string, 
  toStoreId: string
): Promise<{ canTransfer: boolean, reason?: string }> {
  // Main store can transfer to any store
  // Regional stores can only transfer to their children
  // Sub-regional stores can only transfer to siblings
}
```

#### 2. Inventory Source Rules
- **Root Source Rule**: All inventory originates from main store
- **Creation Rule**: Only main store can create inventory items
- **Distribution Rule**: Inventory flows down the hierarchy
- **Request Rule**: Lower stores request from higher levels

#### 3. Approval Workflows
```typescript
// Configurable approval requirements
interface ApprovalRules {
  requireApprovalFor?: number // Minimum quantity
  autoApproveFromParent: boolean
  autoApproveToChildren: boolean
}
```

## Service Architecture

### Service Layer Separation

#### 1. StoresService (Core Store Management)
- Store CRUD operations
- Hierarchy management
- Store configuration
- Access validation

#### 2. StoreInventoryService (Inventory Management)
- Store-specific inventory tracking
- Stock level management
- Threshold monitoring
- Inventory distribution

#### 3. StoreTransferService (Transfer Operations)
- Transfer creation and validation
- Request/approval workflows
- Hierarchy enforcement
- Status management

#### 4. TenantConfigurationService (Multi-Store Toggle)
- Enable/disable multi-store functionality
- Configuration management
- Migration handling
- Validation logic

### Transaction Management

#### Atomic Operations
```typescript
// Transfer processing with atomicity
await this.prisma.$transaction(async (tx) => {
  // 1. Decrease source store inventory
  // 2. Increase destination store inventory
  // 3. Update transfer status
  // 4. Update request status (if applicable)
  // All or nothing execution
});
```

## API Design Patterns

### RESTful Hierarchy
```
GET    /stores                     # List all stores
POST   /stores                     # Create store
GET    /stores/{id}                # Get store details
PUT    /stores/{id}                # Update store
DELETE /stores/{id}                # Delete store

GET    /stores/hierarchy           # Get hierarchical view
GET    /stores/stats               # Store statistics

GET    /stores/{id}/inventory      # Store inventory
POST   /stores/{id}/inventory      # Add inventory to store
GET    /stores/{id}/inventory/stats # Inventory statistics

POST   /stores/{id}/transfers      # Create transfer from store
GET    /stores/{id}/transfers      # Get store transfers

POST   /stores/{id}/requests       # Create request from store
GET    /stores/{id}/requests       # Get store requests
PUT    /stores/requests/{id}/approve # Approve request
PUT    /stores/requests/{id}/reject  # Reject request
```

### Configuration Endpoints
```
GET    /tenants/multi-store/status    # Multi-store status
POST   /tenants/multi-store/enable    # Enable multi-store
POST   /tenants/multi-store/disable   # Disable multi-store
GET    /tenants/store-types           # Available store types
GET    /tenants/hierarchy/limits      # Hierarchy limits
```

## Integration Patterns

### Existing System Integration

#### 1. Authentication & Authorization
- Integrates with existing JWT strategy
- Uses existing RBAC permission system
- Extends with store-specific guards

#### 2. Tenant Context
- Leverages existing tenant middleware
- Maintains tenant isolation patterns
- Extends tenant configuration

#### 3. Inventory System
- Backwards compatible with single-store mode
- Store-aware inventory services
- Transparent fallback for existing APIs

### Migration Strategy

#### Single-Store to Multi-Store
```typescript
async enableMultiStore(config: MultiStoreConfig) {
  await this.prisma.$transaction(async (tx) => {
    // 1. Update tenant store type
    // 2. Convert existing store to main store
    // 3. Create store configuration
    // 4. Migrate existing inventory to store inventory
  });
}
```

## Performance Considerations

### Query Optimization

#### 1. Hierarchical Queries
```sql
-- Get store hierarchy with counts
SELECT s.*, COUNT(si.id) as inventory_count
FROM stores s
LEFT JOIN store_inventories si ON s.id = si.store_id
WHERE s.tenant_id = ?
GROUP BY s.id
ORDER BY s.type ASC, s.created_at ASC
```

#### 2. Index Strategy
```typescript
// Key indexes for performance
@@index([tenantId, type])        // Store queries
@@index([storeId, inventoryId])  // Store inventory lookups
@@index([tenantId, status])      // Transfer queries
@@unique([storeId, inventoryId]) // Prevent duplicates
```

### Caching Strategy

#### 1. Store Hierarchy Cache
- Cache store hierarchy per tenant
- Invalidate on store structure changes
- TTL: 1 hour

#### 2. Permission Cache
- Cache user store permissions
- Invalidate on role/store assignment changes
- TTL: 15 minutes

## Monitoring & Observability

### Key Metrics

#### 1. Operational Metrics
- Transfer success/failure rates
- Request approval times
- Store inventory levels
- Transfer volumes by store type

#### 2. Security Metrics
- Unauthorized access attempts
- Cross-store access violations
- Permission escalation attempts

#### 3. Performance Metrics
- API response times
- Query execution times
- Transaction success rates

### Audit Trail

#### 1. Transfer Audit
```typescript
{
  transferId: string
  action: 'CREATED' | 'APPROVED' | 'COMPLETED' | 'REJECTED'
  userId: string
  timestamp: Date
  metadata: TransferMetadata
}
```

#### 2. Request Audit
```typescript
{
  requestId: string
  action: 'CREATED' | 'APPROVED' | 'REJECTED' | 'FULFILLED'
  userId: string
  decision: ApprovalDecision
  timestamp: Date
}
```

## Error Handling & Recovery

### Error Categories

#### 1. Business Logic Errors
- Insufficient inventory
- Hierarchy violations
- Permission denials
- Invalid configurations

#### 2. Data Consistency Errors
- Concurrent modifications
- Orphaned transfers
- Inventory mismatches

#### 3. System Errors
- Database failures
- Network issues
- Service unavailability

### Recovery Strategies

#### 1. Transaction Rollback
- Automatic rollback on failure
- Compensation transactions
- State reconciliation

#### 2. Retry Mechanisms
- Exponential backoff
- Circuit breaker pattern
- Dead letter queues

## Future Extensibility

### Planned Enhancements

#### 1. Advanced Workflows
- Multi-step approval processes
- Scheduled transfers
- Automated restocking

#### 2. Analytics & Reporting
- Transfer analytics
- Store performance metrics
- Predictive inventory management

#### 3. Integration Capabilities
- Third-party logistics systems
- External inventory management
- IoT device integration

This architecture provides a robust, secure, and scalable foundation for multi-store operations while maintaining backwards compatibility and following established enterprise patterns.