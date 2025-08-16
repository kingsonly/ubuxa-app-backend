# Inventory Batch Allocation Migration

This migration allocates existing inventory batches to their tenant's main store, enabling the store-based inventory allocation system.

## Prerequisites

Before running this migration, ensure that:

1. All tenants have main stores (run the store migration first if needed):

   ```bash
   npm run migrate:stores
   ```

2. The database schema has been updated with the new `storeAllocations` and `transferRequests` JSON fields on the `InventoryBatch` model.

## Migration Commands

### Test Migration (Dry Run)

Test the migration without making any changes to verify prerequisites and see what would be migrated:

```bash
npm run migrate:inventory-batches test
```

This will:

- Validate that all tenants have main stores
- Show how many batches would be migrated
- Group batches by tenant for reporting
- Verify no data integrity issues

### Run Migration

Execute the complete migration process:

```bash
npm run migrate:inventory-batches run
```

This will:

1. Validate prerequisites (all tenants have main stores)
2. Allocate all existing inventory batches to their tenant's main store
3. Validate the migration results
4. Report success/failure statistics

### Validate Migration

Check if an existing migration was successful:

```bash
npm run migrate:inventory-batches validate
```

This will:

- Verify no batches are missing store allocations
- Validate allocation quantities match batch quantities
- Report any data integrity issues

### Rollback Migration

Remove store allocations created by the migration:

```bash
npm run migrate:inventory-batches rollback
```

This will:

- Find all batches with allocations created by `SYSTEM_MIGRATION`
- Remove the `storeAllocations` and `transferRequests` JSON fields
- Report rollback statistics

## Migration Process

### What the Migration Does

1. **Validation**: Ensures all tenants have main stores before proceeding
2. **Batch Processing**: Processes inventory batches in chunks of 100 to avoid memory issues
3. **Allocation Creation**: For each batch:
   - Creates a store allocation entry for the tenant's main store
   - Sets `allocated` quantity to the batch's `remainingQuantity`
   - Sets `reserved` quantity to the batch's `reservedQuantity`
   - Records the allocation as created by `SYSTEM_MIGRATION`
4. **Validation**: Verifies all batches have correct allocations after migration

### Data Structure

The migration creates JSON data in the `storeAllocations` field with this structure:

```json
{
  "storeId": {
    "allocated": 100,
    "reserved": 10,
    "lastUpdated": "2025-08-16T10:00:00.000Z",
    "updatedBy": "SYSTEM_MIGRATION"
  }
}
```

### Error Handling

- **Tenant Validation**: Migration fails if any tenant lacks a main store
- **Batch Processing**: Individual batch failures are logged but don't stop the migration
- **Chunk Processing**: Batches are processed in chunks to handle large datasets
- **Rollback Safety**: Only allocations created by `SYSTEM_MIGRATION` are removed during rollback

## Requirements Satisfied

This migration satisfies the following requirements from the specification:

- **6.1**: All existing inventory batches are allocated to their tenant's main store
- **6.2**: All existing inventory quantities and relationships are preserved
- **6.3**: Migration validates that all batches have proper store allocations
- **6.4**: Automatic main store creation validation (requires store migration first)

## Monitoring and Logging

The migration provides detailed logging:

- Progress updates during batch processing
- Success/failure statistics for each chunk
- Detailed error messages for failed batches
- Validation results and any data integrity issues

## Recovery

If the migration fails:

1. Check the logs for specific error messages
2. Fix any underlying issues (e.g., missing main stores)
3. Run the migration again (it's idempotent)
4. Use rollback if needed to start fresh

## Performance Considerations

- Batches are processed in chunks of 100 to manage memory usage
- Uses `Promise.allSettled()` for parallel processing within chunks
- Includes progress reporting for long-running migrations
- Optimized queries to minimize database round trips

## Testing

The migration includes comprehensive unit tests covering:

- Validation scenarios
- Successful migration flows
- Error handling
- Rollback functionality
- Edge cases (empty datasets, missing stores, etc.)

Run tests with:

```bash
npm test -- --testPathPattern="allocate-inventory-batches.migration.spec.ts"
```
