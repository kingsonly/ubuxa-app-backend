/**
 * Store Allocation Helper
 *
 * Utility class for managing store inventory batch allocations stored in JSON format.
 * Provides methods for updating, reading, and validating store allocations.
 */

export interface StoreAllocations {
  [storeId: string]: {
    allocated: number;
    reserved: number;
    lastUpdated: string; // ISO date
    updatedBy: string; // User ID
  };
}

export interface TransferRequests {
  [requestId: string]: {
    type: 'ALLOCATION' | 'TRANSFER';
    sourceStoreId: string;
    targetStoreId: string;
    requestedQuantity: number;
    approvedQuantity?: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
    reason?: string;

    // Audit trail in JSON
    requestedBy: string; // User ID
    requestedAt: string; // ISO date
    requestedByName: string; // User name for display

    approvedBy?: string; // User ID
    approvedAt?: string; // ISO date
    approvedByName?: string; // User name for display

    confirmedBy?: string; // User ID
    confirmedAt?: string; // ISO date
    confirmedByName?: string; // User name for display

    rejectionReason?: string;
  };
}

export class StoreAllocationHelper {
  /**
   * Updates store allocation for a specific store
   *
   * @param currentAllocations - Current store allocations object
   * @param storeId - ID of the store to update
   * @param allocated - New allocated quantity
   * @param reserved - New reserved quantity
   * @param userId - ID of the user making the update
   * @returns Updated store allocations object
   */
  static updateStoreAllocation(
    currentAllocations: StoreAllocations,
    storeId: string,
    allocated: number,
    reserved: number,
    userId: string,
  ): StoreAllocations {
    // Validate inputs
    if (!storeId) {
      throw new Error('Store ID is required');
    }
    if (allocated < 0) {
      throw new Error('Allocated quantity cannot be negative');
    }
    if (reserved < 0) {
      throw new Error('Reserved quantity cannot be negative');
    }
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Create a copy of current allocations to avoid mutation
    const updatedAllocations: StoreAllocations = {
      ...currentAllocations,
    };

    // Update or create the store allocation
    updatedAllocations[storeId] = {
      allocated,
      reserved,
      lastUpdated: new Date().toISOString(),
      updatedBy: userId,
    };

    return updatedAllocations;
  }

  /**
   * Gets store allocation for a specific store
   *
   * @param allocations - Store allocations object
   * @param storeId - ID of the store to get allocation for
   * @returns Store allocation data or null if not found
   */
  static getStoreAllocation(
    allocations: StoreAllocations,
    storeId: string,
  ): { allocated: number; reserved: number } | null {
    if (!allocations || !storeId) {
      return null;
    }

    const storeAllocation = allocations[storeId];
    if (!storeAllocation) {
      return null;
    }

    return {
      allocated: storeAllocation.allocated,
      reserved: storeAllocation.reserved,
    };
  }

  /**
   * Calculates total allocated quantity across all stores
   *
   * @param allocations - Store allocations object
   * @returns Total allocated quantity
   */
  static getTotalAllocated(allocations: StoreAllocations): number {
    if (!allocations) {
      return 0;
    }

    return Object.values(allocations).reduce(
      (total, allocation) => total + allocation.allocated,
      0,
    );
  }

  /**
   * Calculates total reserved quantity across all stores
   *
   * @param allocations - Store allocations object
   * @returns Total reserved quantity
   */
  static getTotalReserved(allocations: StoreAllocations): number {
    if (!allocations) {
      return 0;
    }

    return Object.values(allocations).reduce(
      (total, allocation) => total + allocation.reserved,
      0,
    );
  }

  /**
   * Gets all store IDs that have allocations
   *
   * @param allocations - Store allocations object
   * @returns Array of store IDs
   */
  static getAllocatedStoreIds(allocations: StoreAllocations): string[] {
    if (!allocations) {
      return [];
    }

    return Object.keys(allocations);
  }

  /**
   * Checks if a store has any allocation
   *
   * @param allocations - Store allocations object
   * @param storeId - ID of the store to check
   * @returns True if store has allocation, false otherwise
   */
  static hasStoreAllocation(
    allocations: StoreAllocations,
    storeId: string,
  ): boolean {
    return !!(allocations && allocations[storeId]);
  }

  /**
   * Removes store allocation for a specific store
   *
   * @param currentAllocations - Current store allocations object
   * @param storeId - ID of the store to remove
   * @returns Updated store allocations object without the specified store
   */
  static removeStoreAllocation(
    currentAllocations: StoreAllocations,
    storeId: string,
  ): StoreAllocations {
    if (!currentAllocations || !storeId) {
      return currentAllocations || {};
    }

    const updatedAllocations = { ...currentAllocations };
    delete updatedAllocations[storeId];
    return updatedAllocations;
  }

  /**
   * Validates that total allocations don't exceed batch quantity
   *
   * @param allocations - Store allocations object
   * @param batchQuantity - Total batch quantity
   * @returns True if valid, false otherwise
   */
  static validateTotalAllocations(
    allocations: StoreAllocations,
    batchQuantity: number,
  ): boolean {
    const totalAllocated = this.getTotalAllocated(allocations);
    return totalAllocated <= batchQuantity;
  }
}
