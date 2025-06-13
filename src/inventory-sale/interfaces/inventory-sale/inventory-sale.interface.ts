export interface InventoryBatchAllocation {
    batchId: string;
    quantity: number;
    unitPrice: number;
  }

export interface ProcessedInventoryItem {
    inventoryId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  batchAllocations: InventoryBatchAllocation[];
  devices?: string[];
  }