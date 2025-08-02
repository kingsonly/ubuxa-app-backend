export interface InventoryBatchAllocation {
    batchId: string;
    quantity: number;
    unitPrice: number;
    storeAllocationId?: string; // Optional store allocation reference
  }

export interface ProcessedInventoryItem {
    inventoryId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  batchAllocations: InventoryBatchAllocation[];
  devices?: string[];
  }

export interface ReservationPreview {
    reservationId: string;
    items: ProcessedInventoryItem[];
    pricing: {
      subtotal: number;
      miscellaneousTotal: number;
      finalTotal: number;
    };
    availability: {
      available: boolean;
      issues: string[];
    };
    expiresAt: Date;
  }