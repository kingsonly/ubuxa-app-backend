# Batch-Aware Store Inventory System

## Overview

The batch-aware store inventory system extends the basic store inventory management to track individual inventory batches across multiple stores. This is crucial for proper inventory management as it enables:

- **Batch-level tracking**: Know exactly which batches are in which stores
- **FIFO/LIFO operations**: Proper first-in-first-out or last-in-first-out inventory rotation
- **Expiry management**: Track expiry dates at the batch level
- **Cost tracking**: Maintain different costs and prices per batch
- **Traceability**: Full audit trail of batch movements between stores

## Architecture

### Database Models

#### 1. StoreBatchInventory
Tracks individual inventory batches per store:
```prisma
model StoreBatchInventory {
  id                 String    @id @default(auto()) @map("_id") @db.ObjectId
  storeId            String    @db.ObjectId
  inventoryId        String    @db.ObjectId
  inventoryBatchId   String    @db.ObjectId
  quantity           Int       @default(0)
  reservedQuantity   Int       @default(0)
  allocatedQuantity  Int       @default(0)
  allocationDate     DateTime  @default(now())
  expiryDate         DateTime?
  costPerUnit        Float?
  pricePerUnit       Float
  rootSourceStoreId  String    @db.ObjectId
  transferId         String?   @db.ObjectId
  tenantId           String    @db.ObjectId
  
  @@unique([storeId, inventoryId, inventoryBatchId])
}
```

#### 2. StoreBatchTransfer
Enhanced transfers with batch-specific information:
```prisma
model StoreBatchTransfer {
  id                String    @id @default(auto()) @map("_id") @db.ObjectId
  transferNumber    String    @unique
  fromStoreId       String    @db.ObjectId
  toStoreId         String    @db.ObjectId
  inventoryId       String    @db.ObjectId
  inventoryBatchId  String    @db.ObjectId
  quantity          Int
  batchCostPerUnit  Float?
  batchPricePerUnit Float
  batchExpiryDate   DateTime?
  transferType      TransferType @default(DISTRIBUTION)
  status            TransferStatus @default(PENDING)
  // ... workflow fields
}
```

#### 3. StoreBatchRequest
Batch-aware requests with preferences:
```prisma
model StoreBatchRequest {
  id                  String    @id @default(auto()) @map("_id") @db.ObjectId
  requestNumber       String    @unique
  fromStoreId         String    @db.ObjectId
  toStoreId           String    @db.ObjectId
  inventoryId         String    @db.ObjectId
  preferredBatchId    String?   @db.ObjectId
  preferOldestBatch   Boolean   @default(true)
  preferNewestBatch   Boolean   @default(false)
  maxAcceptablePrice  Float?
  minExpiryDate       DateTime?
  requestedQuantity   Int
  approvedQuantity    Int?
  // ... workflow fields
}
```

## Services

### StoreBatchInventoryService

The main service for batch-aware inventory operations:

#### Key Methods

1. **allocateInventoryBatchesToStore()**
   - Allocates specific batches to a store
   - Validates batch availability
   - Updates both batch and aggregate inventory
   - Maintains audit trail

2. **getStoreBatchInventory()**
   - Retrieves batch-level inventory for a store
   - Supports filtering, sorting, and pagination
   - Includes expiry and stock level filters

3. **transferBatchesBetweenStores()**
   - Transfers specific batches between stores
   - Creates transfer records
   - Updates quantities in both stores
   - Maintains batch traceability

4. **getAvailableBatchesForAllocation()**
   - Suggests optimal batch allocation using FIFO/LIFO
   - Calculates shortfalls
   - Returns allocation strategy

### Enhanced StoreInventoryService

The existing service now includes batch-aware methods:

1. **addInventoryToStoreWithBatchAllocation()**
   - Automatically allocates available batches using FIFO/LIFO
   - Integrates with batch service
   - Maintains backward compatibility

2. **getStoreInventoryWithBatches()**
   - Returns both aggregate and batch-level inventory
   - Comprehensive view of store inventory

## Usage Examples

### 1. Allocating Specific Batches to a Store

```typescript
const batchService = new StoreBatchInventoryService(prisma, storeContext, tenantContext);

await batchService.allocateInventoryBatchesToStore(storeId, {
  inventoryId: 'inv-123',
  batchAllocations: [
    {
      inventoryBatchId: 'batch-001',
      quantity: 50,
      pricePerUnit: 25.00
    },
    {
      inventoryBatchId: 'batch-002', 
      quantity: 30,
      pricePerUnit: 27.50
    }
  ],
  totalQuantity: 80
});
```

### 2. Automatic Batch Allocation (FIFO)

```typescript
const inventoryService = new StoreInventoryService(prisma, storeContext, tenantContext);

await inventoryService.addInventoryToStoreWithBatchAllocation(storeId, {
  inventoryId: 'inv-123',
  quantity: 100,
  allocationStrategy: 'FIFO'
});
```

### 3. Transferring Batches Between Stores

```typescript
await batchService.transferBatchesBetweenStores({
  fromStoreId: 'store-main',
  toStoreId: 'store-regional-1',
  inventoryId: 'inv-123',
  batchAllocations: [
    {
      inventoryBatchId: 'batch-001',
      quantity: 25
    }
  ],
  transferType: 'DISTRIBUTION',
  notes: 'Monthly distribution to regional store'
});
```

### 4. Getting Available Batches for Allocation

```typescript
const allocation = await batchService.getAvailableBatchesForAllocation(
  'inv-123',
  100,
  'FIFO'
);

if (allocation.fullyAllocated) {
  // Proceed with allocation
  await batchService.allocateInventoryBatchesToStore(storeId, {
    inventoryId: 'inv-123',
    batchAllocations: allocation.allocations,
    totalQuantity: 100
  });
} else {
  console.log(`Shortfall: ${allocation.shortfall} units`);
}
```

### 5. Querying Store Batch Inventory

```typescript
const batchInventory = await batchService.getStoreBatchInventory(storeId, {
  page: 1,
  limit: 20,
  sortBy: 'expiry_date',
  sortOrder: 'asc',
  stockLevel: 'in_stock',
  includeExpired: false
});

console.log(`Total batches: ${batchInventory.summary.totalBatches}`);
console.log(`Expiring soon: ${batchInventory.summary.expiringSoon}`);
```

## API Endpoints

### Batch Inventory Management

```typescript
// Allocate batches to store
POST /stores/:storeId/batch-inventory/allocate
Body: AllocateInventoryBatchesToStoreDto

// Get store batch inventory
GET /stores/:storeId/batch-inventory
Query: StoreBatchInventoryFilterDto

// Transfer batches between stores
POST /stores/batch-transfers
Body: BatchTransferDto

// Get available batches for allocation
POST /inventory/:inventoryId/available-batches
Body: GetAvailableBatchesDto
```

### Enhanced Existing Endpoints

```typescript
// Add inventory with automatic batch allocation
POST /stores/:storeId/inventory/with-batches
Body: AddStoreInventoryDto & { allocationStrategy?: 'FIFO' | 'LIFO' }

// Get inventory with batch details
GET /stores/:storeId/inventory/with-batches
Query: StoreInventoryFilterDto
```

## Benefits

### 1. Accurate Inventory Tracking
- Know exactly which batches are where
- Track individual batch quantities and movements
- Maintain accurate cost and pricing per batch

### 2. Proper Inventory Rotation
- FIFO ensures older inventory is used first
- LIFO for specific business requirements
- Prevents inventory spoilage and waste

### 3. Enhanced Traceability
- Full audit trail of batch movements
- Source tracking from main store to end location
- Transfer history for compliance and analysis

### 4. Better Decision Making
- Expiry date management prevents waste
- Cost tracking enables better pricing decisions
- Stock level monitoring at batch granularity

### 5. Compliance and Quality Control
- Batch-level recalls and quality issues
- Regulatory compliance for tracked products
- Quality assurance through batch history

## Integration with Existing System

### Backward Compatibility
- Existing `StoreInventory` model remains unchanged
- Aggregate quantities are automatically calculated from batches
- Legacy endpoints continue to work

### Migration Strategy
1. **Phase 1**: Deploy batch models alongside existing system
2. **Phase 2**: Migrate existing inventory to batch-aware system
3. **Phase 3**: Gradually adopt batch-aware endpoints
4. **Phase 4**: Deprecate legacy batch-unaware operations

### Data Consistency
- Batch allocations automatically update aggregate inventory
- Transactions ensure consistency between batch and aggregate data
- Validation prevents overselling and negative quantities

## Best Practices

### 1. Batch Allocation Strategy
- Use FIFO for perishable goods
- Use LIFO for non-perishable items when appropriate
- Consider expiry dates in allocation decisions

### 2. Transfer Management
- Always validate batch availability before transfers
- Use appropriate transfer types for audit trails
- Include meaningful notes for transfer reasons

### 3. Inventory Monitoring
- Set up alerts for expiring batches
- Monitor low stock at batch level
- Regular reconciliation between batch and aggregate data

### 4. Performance Considerations
- Index on frequently queried fields (storeId, inventoryId, batchId)
- Use pagination for large batch inventories
- Consider caching for frequently accessed data

This batch-aware system provides the foundation for sophisticated inventory management while maintaining compatibility with existing operations.