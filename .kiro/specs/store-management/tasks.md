# Implementation Plan

- [x] 1. Create Prisma schema models for store management



  - Create Store model with tenant relationship and user assignments
  - Create InventoryBatchAllocation model for batch-to-store allocations
  - Add assignedStoreId field to existing User model
  - Update SubjectEnum in role.prisma to include Store subject
  - _Requirements: 1.1, 1.2, 2.1, 3.1, 5.1, 7.1_


- [x] 2. Implement store utilities and context services


  - [ ] 2.1 Create store encryption/decryption utilities following tenant pattern
    - Write encryptStoreId and decryptStoreId functions using same crypto approach as tenant
    - Implement extractStoreIdFromToken function for JWT token parsing
    - Create shouldSkipStoreCheck function for middleware path exclusions


    - _Requirements: 6.1, 6.2_

  - [x] 2.2 Implement StoreContext service for request-scoped store access

    - Create StoreContext injectable service with REQUEST scope


    - Implement getStoreId and requireStoreId methods following TenantContext pattern
    - Add proper error handling for missing store context
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 3. Create store middleware for request context


  - [ ] 3.1 Implement storeMiddleware function following tenantMiddleware pattern
    - Extract store ID from JWT token using store utilities
    - Set store context in request object and headers


    - Implement fallback to user's assigned store when no store in token


    - Add proper error handling and logging
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 3.2 Integrate store middleware into application module
    - Add store middleware to middleware chain after tenant middleware


    - Configure middleware to run on appropriate routes
    - Test middleware integration with existing tenant middleware
    - _Requirements: 6.1, 6.4_

- [x] 4. Implement core store service with CRUD operations


  - [ ] 4.1 Create StoreService with basic CRUD methods
    - Implement createStore, findAllByTenant, findOne, update, remove methods
    - Add tenant-scoped validation for all store operations
    - Implement findMainStore and createMainStore methods
    - Write unit tests for all CRUD operations
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4_

  - [ ] 4.2 Implement user assignment methods in StoreService
    - Create assignUserToStore method to update user's assignedStoreId
    - Implement getUserStore method to get user's assigned store
    - Add getStoreUsers method to list users assigned to a store
    - Write unit tests for user assignment operations
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ] 4.3 Implement batch allocation methods in StoreService
    - Create allocateBatchToStore method with quantity validation
    - Implement getStoreBatchAllocations to list store's allocated batches
    - Add transferBatchAllocation method for moving batches between stores
    - Write unit tests for batch allocation operations
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 5. Create store controller with REST endpoints
  - [ ] 5.1 Implement basic store CRUD endpoints
    - Create POST /stores endpoint for store creation with tenant scoping
    - Implement GET /stores endpoint with proper permission checks
    - Add GET /stores/:id, PATCH /stores/:id, DELETE /stores/:id endpoints
    - Apply proper guards (JwtAuthGuard, TenantGuard) and permissions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.2, 7.3_

  - [ ] 5.2 Implement user assignment endpoints
    - Create POST /stores/:id/assign-user endpoint for user assignments
    - Add GET /stores/:id/users endpoint to list store users
    - Implement proper permission validation for user management
    - Write integration tests for user assignment endpoints
    - _Requirements: 5.1, 5.4, 7.2, 7.3_

  - [ ] 5.3 Implement batch allocation endpoints
    - Create POST /stores/:id/allocate-batch endpoint with quantity validation
    - Add GET /stores/:id/batches endpoint to list store's batch allocations
    - Implement proper authorization for batch allocation operations
    - Write integration tests for batch allocation endpoints
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.2, 7.3_

- [ ] 6. Enhance authentication service with store context
  - [ ] 6.1 Update login method to include store information in JWT
    - Modify login method to get user's assigned store
    - Add encrypted store ID to JWT payload when user has assigned store
    - Update login response to include store information
    - Write unit tests for enhanced login flow
    - _Requirements: 5.2, 6.1, 6.2_

  - [ ] 6.2 Implement store selection functionality
    - Create selectStoreLogin method for store switching
    - Add getUserStore method to get user's current store assignment
    - Implement proper validation for store access permissions
    - Write unit tests for store selection methods
    - _Requirements: 5.2, 5.3, 6.1, 6.2_

  - [ ] 6.3 Create enhanced authentication controller endpoints
    - Add POST /auth/select-store endpoint for store selection
    - Implement GET /auth/user-store endpoint to get current user's store
    - Apply proper guards and validation to new endpoints
    - Write integration tests for store authentication endpoints
    - _Requirements: 5.2, 6.1, 6.2_

- [ ] 7. Enhance tenant service to auto-create main stores
  - [ ] 7.1 Update tenant creation to include main store creation
    - Modify createTenant method to use database transaction
    - Add main store creation logic within tenant creation transaction
    - Ensure proper rollback if either tenant or store creation fails
    - Write unit tests for transactional tenant and store creation
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 7.2 Create data migration for existing tenants
    - Write migration script to create main stores for existing tenants
    - Implement user assignment migration to assign users to main stores
    - Add validation to ensure all tenants have main stores after migration
    - Test migration script with sample data
    - _Requirements: 1.1, 5.1, 9.3_

- [ ] 8. Update inventory and sales services for store scoping
  - [ ] 8.1 Enhance inventory batch operations with store allocations
    - Update inventory batch creation to support store allocations
    - Modify batch availability queries to respect store allocations
    - Ensure existing inventory operations continue to work unchanged
    - Write unit tests for store-scoped inventory operations
    - _Requirements: 3.1, 3.2, 4.2, 9.1, 9.2_

  - [ ] 8.2 Update sales service to validate store-based batch access
    - Modify sales creation to verify batch allocation to user's store
    - Update inventory reservation logic to respect store allocations
    - Ensure sales can only access batches allocated to their store
    - Write unit tests for store-scoped sales operations
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.1_

- [ ] 9. Create store module and integrate with existing modules
  - [ ] 9.1 Create StoreModule with proper dependency injection
    - Create StoreModule with StoreService and StoreController
    - Import required modules (TenantsModule, PrismaModule)
    - Export StoreService for use in other modules
    - Configure module with proper providers and controllers
    - _Requirements: 9.1, 9.2_

  - [ ] 9.2 Update existing modules to import StoreModule where needed
    - Update InventoryModule to import StoreModule for batch allocations
    - Modify SalesModule to import StoreModule for store validation
    - Update AuthModule to include store context services
    - Test module integration and dependency resolution
    - _Requirements: 9.1, 9.2, 9.4_

- [ ] 10. Create comprehensive test suite for store functionality
  - [ ] 10.1 Write unit tests for all store services and utilities
    - Test store CRUD operations with proper tenant scoping
    - Test user assignment and batch allocation functionality
    - Test store encryption/decryption utilities
    - Test store context service methods
    - _Requirements: All requirements_

  - [ ] 10.2 Write integration tests for store endpoints and workflows
    - Test complete store creation and management workflows
    - Test user assignment and store switching scenarios
    - Test batch allocation and sales workflows
    - Test permission validation across all store operations
    - _Requirements: All requirements_

  - [ ] 10.3 Write end-to-end tests for multi-store scenarios
    - Test tenant creation with automatic main store creation
    - Test multi-store operations with proper user scoping
    - Test store context middleware integration
    - Test backward compatibility with existing functionality
    - _Requirements: 1.1, 2.1, 5.1, 6.1, 9.1, 9.2, 9.4_