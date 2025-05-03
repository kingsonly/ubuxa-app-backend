import { InventoryClass, InventoryStatus } from '@prisma/client';

export const mockInventoryResponse = [
  {
    id: '672a7e32493902cd46999f68',
    name: 'Inventory 1',
    manufacturerName: 'Manufacturer 1',
    inventoryCategoryId: '672a27e74eae9f21bd5bac79',
    inventorySubCategoryId: '672a27e74eae9f21bd5bac7a',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
];

export const mockInventoryBatchResponse = {
  id: '672a7e32493902cd46999f69',
  name: 'Inventory 1',
  dateOfManufacture: '',
  sku: 'TXUNE989',
  image: 'https://example.png',
  batchNumber: 10421880,
  costOfItem: 0,
  price: 700,
  numberOfStock: 80,
  remainingQuantity: 80,
  status: InventoryStatus.IN_STOCK,
  class: InventoryClass.REGULAR,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  inventoryId: '672a7e32493902cd46999f68',
  inventory: {
    id: '672a7e32493902cd46999f68',
    name: 'Inventory 1',
    manufacturerName: 'Manufacturer 1',
    inventoryCategoryId: '672a27e74eae9f21bd5bac79',
    inventorySubCategoryId: '672a27e74eae9f21bd5bac7a',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
};
