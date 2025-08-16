import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

/**
 * Exception thrown when there is insufficient inventory allocation in a store
 * for a requested operation (allocation, transfer, etc.)
 */
export class InsufficientStoreAllocationError extends BadRequestException {
  constructor(
    storeId: string,
    batchId: string,
    requested: number,
    available: number,
  ) {
    super({
      error: 'INSUFFICIENT_STORE_ALLOCATION',
      message: `Insufficient inventory allocation for store. Requested: ${requested}, Available: ${available}`,
      storeId,
      batchId,
      requested,
      available,
    });
  }
}

/**
 * Exception thrown when a user attempts to perform an operation on a store
 * they don't have access to or permission for
 */
export class StoreAccessDeniedError extends ForbiddenException {
  constructor(storeId: string, action: string, userId?: string) {
    super({
      error: 'STORE_ACCESS_DENIED',
      message: `Access denied for store operation: ${action}`,
      storeId,
      action,
      userId,
    });
  }
}

/**
 * Exception thrown when a transfer request is invalid due to business rules,
 * validation failures, or state conflicts
 */
export class InvalidTransferRequestError extends BadRequestException {
  constructor(reason: string, requestId?: string, details?: any) {
    super({
      error: 'INVALID_TRANSFER_REQUEST',
      message: reason,
      requestId,
      details,
    });
  }
}

/**
 * Exception thrown when a transfer request is not found or doesn't exist
 */
export class TransferRequestNotFoundError extends NotFoundException {
  constructor(requestId: string) {
    super({
      error: 'TRANSFER_REQUEST_NOT_FOUND',
      message: `Transfer request with ID ${requestId} not found`,
      requestId,
    });
  }
}

/**
 * Exception thrown when attempting to perform an operation on a transfer request
 * that is in an invalid state for that operation
 */
export class InvalidTransferRequestStateError extends BadRequestException {
  constructor(
    requestId: string,
    currentState: string,
    requiredState: string,
    operation: string,
  ) {
    super({
      error: 'INVALID_TRANSFER_REQUEST_STATE',
      message: `Cannot perform ${operation} on transfer request in state ${currentState}. Required state: ${requiredState}`,
      requestId,
      currentState,
      requiredState,
      operation,
    });
  }
}

/**
 * Exception thrown when a store is not found or doesn't exist in the tenant context
 */
export class StoreNotFoundError extends NotFoundException {
  constructor(storeId: string, tenantId?: string) {
    super({
      error: 'STORE_NOT_FOUND',
      message: `Store with ID ${storeId} not found`,
      storeId,
      tenantId,
    });
  }
}

/**
 * Exception thrown when an inventory batch is not found or doesn't exist
 */
export class InventoryBatchNotFoundError extends NotFoundException {
  constructor(batchId: string, tenantId?: string) {
    super({
      error: 'INVENTORY_BATCH_NOT_FOUND',
      message: `Inventory batch with ID ${batchId} not found`,
      batchId,
      tenantId,
    });
  }
}

/**
 * Exception thrown when there's a conflict with existing transfer requests
 * (e.g., duplicate pending requests)
 */
export class TransferRequestConflictError extends BadRequestException {
  constructor(reason: string, conflictingRequestId?: string, details?: any) {
    super({
      error: 'TRANSFER_REQUEST_CONFLICT',
      message: reason,
      conflictingRequestId,
      details,
    });
  }
}
