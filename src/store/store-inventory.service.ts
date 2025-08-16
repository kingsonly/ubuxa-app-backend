import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenants/context/tenant.context';
import { StoreService } from './store.service';
import { UsersService } from '../users/users.service';
import {
  StoreAllocationHelper,
  StoreAllocations,
  TransferRequests,
} from './store-allocation.helper';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { ApproveTransferDto } from './dto/approve-transfer.dto';
import { TransferRequestResponseDto } from './dto/transfer-request-response.dto';
import { v4 as uuidv4 } from 'uuid';
import {
  InsufficientStoreAllocationError,
  StoreAccessDeniedError,
  InvalidTransferRequestError,
  TransferRequestNotFoundError,
  InvalidTransferRequestStateError,
  StoreNotFoundError,
  InventoryBatchNotFoundError,
  TransferRequestConflictError,
} from './exceptions/store-inventory.exceptions';

export interface StoreInventoryView {
  inventoryId: string;
  inventoryName: string;
  batches: {
    batchId: string;
    batchNumber: number;
    totalQuantity: number;
    allocatedToStore: number;
    reservedInStore: number;
    availableInStore: number;
    unitPrice: number;
    isOwnedByStore: boolean;
    ownerStoreName: string;
  }[];
  totalAllocated: number;
  totalAvailable: number;
}

@Injectable()
export class StoreInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeService: StoreService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Allocate inventory batch to a specific store
   * @param batchId - ID of the inventory batch
   * @param storeId - ID of the target store
   * @param quantity - Quantity to allocate
   * @param userId - ID of the user performing the allocation
   */
  async allocateBatchToStore(
    batchId: string,
    storeId: string,
    quantity: number,
    userId: string,
  ): Promise<void> {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate inputs
    if (quantity <= 0) {
      throw new InvalidTransferRequestError(
        'Allocation quantity must be positive',
      );
    }

    // Verify store exists and belongs to tenant
    try {
      await this.storeService.findOne(storeId);
    } catch (error) {
      throw new StoreNotFoundError(storeId, tenantId);
    }

    // Get the batch with current allocations
    const batch = await this.prisma.inventoryBatch.findFirst({
      where: {
        id: batchId,
        tenantId,
        deletedAt: null,
      },
      include: {
        inventory: true,
      },
    });

    if (!batch) {
      throw new InventoryBatchNotFoundError(batchId, tenantId);
    }

    // Parse current store allocations
    const currentAllocations =
      (batch.storeAllocations as StoreAllocations) || {};

    // Calculate total currently allocated
    const totalAllocated =
      StoreAllocationHelper.getTotalAllocated(currentAllocations);

    // Check if we have enough unallocated quantity
    const availableForAllocation = batch.remainingQuantity - totalAllocated;
    if (quantity > availableForAllocation) {
      throw new InsufficientStoreAllocationError(
        storeId,
        batchId,
        quantity,
        availableForAllocation,
      );
    }

    // Get current store allocation
    const currentStoreAllocation = StoreAllocationHelper.getStoreAllocation(
      currentAllocations,
      storeId,
    );

    // Update store allocation
    const updatedAllocations = StoreAllocationHelper.updateStoreAllocation(
      currentAllocations,
      storeId,
      (currentStoreAllocation?.allocated || 0) + quantity,
      currentStoreAllocation?.reserved || 0,
      userId,
    );

    // Update the batch with new allocations
    await this.prisma.inventoryBatch.update({
      where: { id: batchId },
      data: {
        storeAllocations: updatedAllocations,
      },
    });
  }
  /**
   * Get store-specific inventory view showing all batches with store allocation details
   * @param storeId - ID of the store to get inventory view for
   * @returns Store inventory view with batch allocation details
   */
  async getStoreInventoryView(storeId: string): Promise<StoreInventoryView[]> {
    const tenantId = this.tenantContext.requireTenantId();

    // Verify store exists and belongs to tenant
    try {
      await this.storeService.findOne(storeId);
    } catch (error) {
      throw new StoreNotFoundError(storeId, tenantId);
    }

    // Get all inventory batches for the tenant
    const batches = await this.prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      include: {
        inventory: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ inventory: { name: 'asc' } }, { batchNumber: 'asc' }],
    });

    // Get all stores for owner name lookup
    const stores = await this.storeService.findAllByTenant();
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));

    // Group batches by inventory and build the view
    const inventoryMap = new Map<string, StoreInventoryView>();

    for (const batch of batches) {
      const inventoryId = batch.inventory.id;
      const inventoryName = batch.inventory.name;

      // Initialize inventory view if not exists
      if (!inventoryMap.has(inventoryId)) {
        inventoryMap.set(inventoryId, {
          inventoryId,
          inventoryName,
          batches: [],
          totalAllocated: 0,
          totalAvailable: 0,
        });
      }

      const inventoryView = inventoryMap.get(inventoryId)!;

      // Parse store allocations
      const storeAllocations =
        (batch.storeAllocations as StoreAllocations) || {};
      const storeAllocation = StoreAllocationHelper.getStoreAllocation(
        storeAllocations,
        storeId,
      );

      // Find which store owns this batch (has the highest allocation)
      let ownerStoreId = '';
      let maxAllocation = 0;

      for (const [sId, allocation] of Object.entries(storeAllocations)) {
        if (allocation.allocated > maxAllocation) {
          maxAllocation = allocation.allocated;
          ownerStoreId = sId;
        }
      }

      // If no allocations exist, assume main store owns it
      if (!ownerStoreId) {
        const mainStore = await this.storeService.findMainStore();
        ownerStoreId = mainStore.id;
      }

      const allocatedToStore = storeAllocation?.allocated || 0;
      const reservedInStore = storeAllocation?.reserved || 0;
      const availableInStore = Math.max(0, allocatedToStore - reservedInStore);

      inventoryView.batches.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        totalQuantity: batch.numberOfStock,
        allocatedToStore,
        reservedInStore,
        availableInStore,
        unitPrice: batch.price,
        isOwnedByStore: ownerStoreId === storeId,
        ownerStoreName: storeMap.get(ownerStoreId) || 'Unknown Store',
      });

      inventoryView.totalAllocated += allocatedToStore;
      inventoryView.totalAvailable += availableInStore;
    }

    return Array.from(inventoryMap.values());
  }

  /**
   * Create a transfer request for inventory batch allocation
   * @param dto - Transfer request data
   * @param userId - ID of the user creating the request
   * @returns Request ID of the created transfer request
   */
  async createTransferRequest(
    dto: CreateTransferRequestDto,
    userId: string,
  ): Promise<string> {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate inputs
    if (!userId) {
      throw new InvalidTransferRequestError('User ID is required');
    }

    // Get user information for audit trail
    const user = await this.usersService.fetchUserByUserId(userId);
    const userName = `${user.firstname} ${user.lastname}`.trim();

    // Get the batch with current allocations and transfer requests
    const batch = await this.prisma.inventoryBatch.findFirst({
      where: {
        id: dto.inventoryBatchId,
        tenantId,
        deletedAt: null,
      },
      include: {
        inventory: true,
      },
    });

    if (!batch) {
      throw new InventoryBatchNotFoundError(dto.inventoryBatchId, tenantId);
    }

    // Parse current store allocations and transfer requests
    const currentAllocations =
      (batch.storeAllocations as StoreAllocations) || {};
    const currentTransferRequests =
      (batch.transferRequests as TransferRequests) || {};

    // Determine source and target stores based on request type
    let sourceStoreId: string;
    let targetStoreId: string;

    if (dto.type === 'ALLOCATION') {
      // For allocation requests, source is main store, target is requesting store
      const mainStore = await this.storeService.findMainStore();
      sourceStoreId = mainStore.id;

      // For allocation, we need to determine the target store from user context
      // This would typically come from the user's assigned store
      // For now, we'll require it to be passed in the DTO or get it from user context
      if (!dto.sourceStoreId) {
        throw new InvalidTransferRequestError(
          'Target store ID is required for allocation requests',
        );
      }
      targetStoreId = dto.sourceStoreId; // Using sourceStoreId as targetStoreId for allocation
    } else {
      // For transfer requests, source store must be specified
      if (!dto.sourceStoreId) {
        throw new InvalidTransferRequestError(
          'Source store ID is required for transfer requests',
        );
      }
      sourceStoreId = dto.sourceStoreId;

      // Target store would be the requesting user's store
      // For now, we'll require it to be determined from user context
      // This is a simplification - in a real implementation, you'd get this from user's store assignment
      const userStores = await this.storeService.findAllByTenant();
      const userStore = userStores.find(
        (store) =>
          // This is a placeholder - you'd need proper user-store relationship logic
          store.id !== sourceStoreId,
      );

      if (!userStore) {
        throw new InvalidTransferRequestError(
          'Unable to determine target store for user',
        );
      }
      targetStoreId = userStore.id;
    }

    // Verify both stores exist and belong to tenant
    try {
      await this.storeService.findOne(sourceStoreId);
      await this.storeService.findOne(targetStoreId);
    } catch (error) {
      throw new StoreNotFoundError(sourceStoreId, tenantId);
    }

    // Validate that source store has sufficient allocation
    const sourceAllocation = StoreAllocationHelper.getStoreAllocation(
      currentAllocations,
      sourceStoreId,
    );

    if (
      !sourceAllocation ||
      sourceAllocation.allocated < dto.requestedQuantity
    ) {
      throw new InsufficientStoreAllocationError(
        sourceStoreId,
        dto.inventoryBatchId,
        dto.requestedQuantity,
        sourceAllocation?.allocated || 0,
      );
    }

    // Check if there's already a pending request for the same batch from the same target store
    const existingPendingRequest = Object.values(currentTransferRequests).find(
      (request) =>
        request.targetStoreId === targetStoreId && request.status === 'PENDING',
    );

    if (existingPendingRequest) {
      throw new TransferRequestConflictError(
        'A pending transfer request already exists for this batch from the same store',
        Object.keys(currentTransferRequests).find(
          (key) => currentTransferRequests[key] === existingPendingRequest,
        ),
        { sourceStoreId, targetStoreId, batchId: dto.inventoryBatchId },
      );
    }

    // Generate unique request ID
    const requestId = uuidv4();

    // Create the transfer request
    const transferRequest = {
      type: dto.type,
      sourceStoreId,
      targetStoreId,
      requestedQuantity: dto.requestedQuantity,
      status: 'PENDING' as const,
      reason: dto.reason,
      requestedBy: userId,
      requestedAt: new Date().toISOString(),
      requestedByName: userName,
    };

    // Update transfer requests
    const updatedTransferRequests = {
      ...currentTransferRequests,
      [requestId]: transferRequest,
    };

    // Update the batch with new transfer request
    await this.prisma.inventoryBatch.update({
      where: { id: dto.inventoryBatchId },
      data: {
        transferRequests: updatedTransferRequests,
      },
    });

    return requestId;
  }

  /**
   * Approve or reject a transfer request
   * @param requestId - ID of the transfer request
   * @param dto - Approval decision and details
   * @param userId - ID of the user approving/rejecting the request
   */
  async approveTransferRequest(
    requestId: string,
    dto: ApproveTransferDto,
    userId: string,
  ): Promise<void> {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate inputs
    if (!userId) {
      throw new InvalidTransferRequestError('User ID is required');
    }

    // Get user information for audit trail
    const user = await this.usersService.fetchUserByUserId(userId);
    const userName = `${user.firstname} ${user.lastname}`.trim();

    // Find the batch containing this transfer request
    // Since we can't query JSON paths directly in Prisma, we'll get all batches and filter
    const batches = await this.prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        deletedAt: null,
        transferRequests: {
          not: null,
        },
      },
      include: {
        inventory: true,
      },
    });

    // Find the batch that contains our request ID
    const batch = batches.find((b) => {
      const requests = (b.transferRequests as TransferRequests) || {};
      return requests[requestId] !== undefined;
    });

    if (!batch) {
      throw new TransferRequestNotFoundError(requestId);
    }

    // Parse current transfer requests
    const currentTransferRequests =
      (batch.transferRequests as TransferRequests) || {};
    const transferRequest = currentTransferRequests[requestId];

    if (!transferRequest) {
      throw new TransferRequestNotFoundError(requestId);
    }

    // Validate request status
    if (transferRequest.status !== 'PENDING') {
      throw new InvalidTransferRequestStateError(
        requestId,
        transferRequest.status,
        'PENDING',
        'approve',
      );
    }

    // Validate that the approver has access to the source store
    // This is a simplified check - in a real implementation, you'd verify
    // that the user has permission to approve requests for the source store
    try {
      await this.storeService.findOne(transferRequest.sourceStoreId);
    } catch (error) {
      throw new StoreAccessDeniedError(
        transferRequest.sourceStoreId,
        'approve transfer request',
        userId,
      );
    }

    // Validate approval decision
    if (dto.decision === 'APPROVED') {
      // If approving, validate approved quantity
      const approvedQuantity =
        dto.approvedQuantity || transferRequest.requestedQuantity;

      if (approvedQuantity <= 0) {
        throw new InvalidTransferRequestError(
          'Approved quantity must be positive',
        );
      }

      if (approvedQuantity > transferRequest.requestedQuantity) {
        throw new InvalidTransferRequestError(
          'Approved quantity cannot exceed requested quantity',
        );
      }

      // Validate that source store still has sufficient allocation
      const currentAllocations =
        (batch.storeAllocations as StoreAllocations) || {};
      const sourceAllocation = StoreAllocationHelper.getStoreAllocation(
        currentAllocations,
        transferRequest.sourceStoreId,
      );

      if (!sourceAllocation || sourceAllocation.allocated < approvedQuantity) {
        throw new InsufficientStoreAllocationError(
          transferRequest.sourceStoreId,
          batch.id,
          approvedQuantity,
          sourceAllocation?.allocated || 0,
        );
      }

      // Update the transfer request with approval
      const updatedTransferRequest = {
        ...transferRequest,
        status: 'APPROVED' as const,
        approvedQuantity,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        approvedByName: userName,
      };

      // Update transfer requests
      const updatedTransferRequests = {
        ...currentTransferRequests,
        [requestId]: updatedTransferRequest,
      };

      // Update the batch with approved transfer request
      await this.prisma.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          transferRequests: updatedTransferRequests,
        },
      });
    } else {
      // Rejection
      if (!dto.rejectionReason) {
        throw new InvalidTransferRequestError('Rejection reason is required');
      }

      // Update the transfer request with rejection
      const updatedTransferRequest = {
        ...transferRequest,
        status: 'REJECTED' as const,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        approvedByName: userName,
        rejectionReason: dto.rejectionReason,
      };

      // Update transfer requests
      const updatedTransferRequests = {
        ...currentTransferRequests,
        [requestId]: updatedTransferRequest,
      };

      // Update the batch with rejected transfer request
      await this.prisma.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          transferRequests: updatedTransferRequests,
        },
      });
    }
  }

  /**
   * Get pending transfer requests for a specific store with optional filtering
   * @param storeId - ID of the store to get requests for
   * @param filters - Optional filters for request status, type, etc.
   * @returns Array of transfer requests matching the criteria
   */
  async getPendingRequests(
    storeId: string,
    filters?: {
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
      type?: 'ALLOCATION' | 'TRANSFER';
      sourceStoreId?: string;
      targetStoreId?: string;
    },
  ): Promise<TransferRequestResponseDto[]> {
    const tenantId = this.tenantContext.requireTenantId();

    // Verify store exists and belongs to tenant
    try {
      await this.storeService.findOne(storeId);
    } catch (error) {
      throw new StoreNotFoundError(storeId, tenantId);
    }

    // Get all inventory batches that have transfer requests
    const batches = await this.prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        deletedAt: null,
        transferRequests: {
          not: null,
        },
      },
      include: {
        inventory: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get all stores for name lookup
    const stores = await this.storeService.findAllByTenant();
    const storeMap = new Map(stores.map((s) => [s.id, s.name]));

    const transferRequests: TransferRequestResponseDto[] = [];

    // Process each batch and extract relevant transfer requests
    for (const batch of batches) {
      const requests = (batch.transferRequests as TransferRequests) || {};

      for (const [requestId, request] of Object.entries(requests)) {
        // Apply store filtering - include requests where the store is either source or target
        const isRelevantToStore =
          request.sourceStoreId === storeId ||
          request.targetStoreId === storeId;

        if (!isRelevantToStore) {
          continue;
        }

        // Apply optional filters
        if (filters?.status && request.status !== filters.status) {
          continue;
        }

        if (filters?.type && request.type !== filters.type) {
          continue;
        }

        if (
          filters?.sourceStoreId &&
          request.sourceStoreId !== filters.sourceStoreId
        ) {
          continue;
        }

        if (
          filters?.targetStoreId &&
          request.targetStoreId !== filters.targetStoreId
        ) {
          continue;
        }

        // Build the response DTO
        const transferRequestDto: TransferRequestResponseDto = {
          requestId,
          type: request.type,
          sourceStoreId: request.sourceStoreId,
          sourceStoreName:
            storeMap.get(request.sourceStoreId) || 'Unknown Store',
          targetStoreId: request.targetStoreId,
          targetStoreName:
            storeMap.get(request.targetStoreId) || 'Unknown Store',
          inventoryBatchId: batch.id,
          inventoryName: batch.inventory.name,
          batchNumber: batch.batchNumber,
          requestedQuantity: request.requestedQuantity,
          approvedQuantity: request.approvedQuantity,
          status: request.status,
          reason: request.reason,
          requestedBy: request.requestedBy,
          requestedByName: request.requestedByName,
          requestedAt: request.requestedAt,
          approvedBy: request.approvedBy,
          approvedByName: request.approvedByName,
          approvedAt: request.approvedAt,
          confirmedBy: request.confirmedBy,
          confirmedByName: request.confirmedByName,
          confirmedAt: request.confirmedAt,
          rejectionReason: request.rejectionReason,
        };

        transferRequests.push(transferRequestDto);
      }
    }

    // Sort by requested date (most recent first)
    return transferRequests.sort(
      (a, b) =>
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
  }

  /**
   * Confirm an approved transfer request and execute the allocation transfer
   * @param requestId - ID of the transfer request to confirm
   * @param userId - ID of the user confirming the request
   */
  async confirmTransferRequest(
    requestId: string,
    userId: string,
  ): Promise<void> {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate inputs
    if (!userId) {
      throw new InvalidTransferRequestError('User ID is required');
    }

    // Get user information for audit trail
    const user = await this.usersService.fetchUserByUserId(userId);
    const userName = `${user.firstname} ${user.lastname}`.trim();

    // Find the batch containing this transfer request
    // Since we can't query JSON paths directly in Prisma, we'll get all batches and filter
    const batches = await this.prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        deletedAt: null,
        transferRequests: {
          not: null,
        },
      },
      include: {
        inventory: true,
      },
    });

    // Find the batch that contains our request ID
    const batch = batches.find((b) => {
      const requests = (b.transferRequests as TransferRequests) || {};
      return requests[requestId] !== undefined;
    });

    if (!batch) {
      throw new TransferRequestNotFoundError(requestId);
    }

    // Parse current transfer requests and store allocations
    const currentTransferRequests =
      (batch.transferRequests as TransferRequests) || {};
    const transferRequest = currentTransferRequests[requestId];

    if (!transferRequest) {
      throw new TransferRequestNotFoundError(requestId);
    }

    // Validate request status
    if (transferRequest.status !== 'APPROVED') {
      throw new InvalidTransferRequestStateError(
        requestId,
        transferRequest.status,
        'APPROVED',
        'confirm',
      );
    }

    // Validate that the confirmer is authorized for the target store
    // This is a simplified check - in a real implementation, you'd verify
    // that the user has permission to confirm requests for the target store
    try {
      await this.storeService.findOne(transferRequest.targetStoreId);
    } catch (error) {
      throw new StoreAccessDeniedError(
        transferRequest.targetStoreId,
        'confirm transfer request',
        userId,
      );
    }

    // Get current store allocations
    const currentAllocations =
      (batch.storeAllocations as StoreAllocations) || {};

    // Get approved quantity (use approved quantity if available, otherwise requested quantity)
    const transferQuantity =
      transferRequest.approvedQuantity || transferRequest.requestedQuantity;

    // Validate that source store still has sufficient allocation
    const sourceAllocation = StoreAllocationHelper.getStoreAllocation(
      currentAllocations,
      transferRequest.sourceStoreId,
    );

    if (!sourceAllocation || sourceAllocation.allocated < transferQuantity) {
      throw new InsufficientStoreAllocationError(
        transferRequest.sourceStoreId,
        batch.id,
        transferQuantity,
        sourceAllocation?.allocated || 0,
      );
    }

    // Get target store current allocation
    const targetAllocation = StoreAllocationHelper.getStoreAllocation(
      currentAllocations,
      transferRequest.targetStoreId,
    );

    // Update source store allocation (reduce by transfer quantity)
    const updatedSourceAllocations =
      StoreAllocationHelper.updateStoreAllocation(
        currentAllocations,
        transferRequest.sourceStoreId,
        sourceAllocation.allocated - transferQuantity,
        sourceAllocation.reserved,
        userId,
      );

    // Update target store allocation (increase by transfer quantity)
    const updatedAllocations = StoreAllocationHelper.updateStoreAllocation(
      updatedSourceAllocations,
      transferRequest.targetStoreId,
      (targetAllocation?.allocated || 0) + transferQuantity,
      targetAllocation?.reserved || 0,
      userId,
    );

    // Update the transfer request with confirmation
    const updatedTransferRequest = {
      ...transferRequest,
      status: 'COMPLETED' as const,
      confirmedBy: userId,
      confirmedAt: new Date().toISOString(),
      confirmedByName: userName,
    };

    // Update transfer requests
    const updatedTransferRequests = {
      ...currentTransferRequests,
      [requestId]: updatedTransferRequest,
    };

    // Update the batch with completed transfer request and updated allocations
    await this.prisma.inventoryBatch.update({
      where: { id: batch.id },
      data: {
        storeAllocations: updatedAllocations,
        transferRequests: updatedTransferRequests,
      },
    });
  }
}
