import {
  StoreAllocationHelper,
  StoreAllocations,
} from './store-allocation.helper';

describe('StoreAllocationHelper', () => {
  const mockUserId = 'user-123';
  const mockStoreId1 = 'store-1';
  const mockStoreId2 = 'store-2';

  describe('updateStoreAllocation', () => {
    it('should create new allocation for empty allocations object', () => {
      const currentAllocations: StoreAllocations = {};
      const result = StoreAllocationHelper.updateStoreAllocation(
        currentAllocations,
        mockStoreId1,
        100,
        10,
        mockUserId,
      );

      expect(result[mockStoreId1]).toBeDefined();
      expect(result[mockStoreId1].allocated).toBe(100);
      expect(result[mockStoreId1].reserved).toBe(10);
      expect(result[mockStoreId1].updatedBy).toBe(mockUserId);
      expect(result[mockStoreId1].lastUpdated).toBeDefined();
      expect(new Date(result[mockStoreId1].lastUpdated)).toBeInstanceOf(Date);
    });

    it('should update existing allocation', () => {
      const currentAllocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 50,
          reserved: 5,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: 'old-user',
        },
      };

      const result = StoreAllocationHelper.updateStoreAllocation(
        currentAllocations,
        mockStoreId1,
        75,
        15,
        mockUserId,
      );

      expect(result[mockStoreId1].allocated).toBe(75);
      expect(result[mockStoreId1].reserved).toBe(15);
      expect(result[mockStoreId1].updatedBy).toBe(mockUserId);
      expect(result[mockStoreId1].lastUpdated).not.toBe(
        '2023-01-01T00:00:00.000Z',
      );
    });

    it('should not mutate original allocations object', () => {
      const currentAllocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 50,
          reserved: 5,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: 'old-user',
        },
      };

      const originalAllocated = currentAllocations[mockStoreId1].allocated;

      StoreAllocationHelper.updateStoreAllocation(
        currentAllocations,
        mockStoreId1,
        75,
        15,
        mockUserId,
      );

      expect(currentAllocations[mockStoreId1].allocated).toBe(
        originalAllocated,
      );
    });

    it('should preserve other store allocations', () => {
      const currentAllocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 50,
          reserved: 5,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: 'user-1',
        },
        [mockStoreId2]: {
          allocated: 30,
          reserved: 3,
          lastUpdated: '2023-01-02T00:00:00.000Z',
          updatedBy: 'user-2',
        },
      };

      const result = StoreAllocationHelper.updateStoreAllocation(
        currentAllocations,
        mockStoreId1,
        75,
        15,
        mockUserId,
      );

      expect(result[mockStoreId2]).toEqual(currentAllocations[mockStoreId2]);
    });

    it('should throw error for invalid store ID', () => {
      expect(() => {
        StoreAllocationHelper.updateStoreAllocation(
          {},
          '',
          100,
          10,
          mockUserId,
        );
      }).toThrow('Store ID is required');
    });

    it('should throw error for negative allocated quantity', () => {
      expect(() => {
        StoreAllocationHelper.updateStoreAllocation(
          {},
          mockStoreId1,
          -1,
          10,
          mockUserId,
        );
      }).toThrow('Allocated quantity cannot be negative');
    });

    it('should throw error for negative reserved quantity', () => {
      expect(() => {
        StoreAllocationHelper.updateStoreAllocation(
          {},
          mockStoreId1,
          100,
          -1,
          mockUserId,
        );
      }).toThrow('Reserved quantity cannot be negative');
    });

    it('should throw error for invalid user ID', () => {
      expect(() => {
        StoreAllocationHelper.updateStoreAllocation(
          {},
          mockStoreId1,
          100,
          10,
          '',
        );
      }).toThrow('User ID is required');
    });

    it('should allow zero quantities', () => {
      const result = StoreAllocationHelper.updateStoreAllocation(
        {},
        mockStoreId1,
        0,
        0,
        mockUserId,
      );

      expect(result[mockStoreId1].allocated).toBe(0);
      expect(result[mockStoreId1].reserved).toBe(0);
    });
  });

  describe('getStoreAllocation', () => {
    const sampleAllocations: StoreAllocations = {
      [mockStoreId1]: {
        allocated: 100,
        reserved: 10,
        lastUpdated: '2023-01-01T00:00:00.000Z',
        updatedBy: mockUserId,
      },
      [mockStoreId2]: {
        allocated: 50,
        reserved: 5,
        lastUpdated: '2023-01-02T00:00:00.000Z',
        updatedBy: 'user-2',
      },
    };

    it('should return allocation for existing store', () => {
      const result = StoreAllocationHelper.getStoreAllocation(
        sampleAllocations,
        mockStoreId1,
      );

      expect(result).toEqual({
        allocated: 100,
        reserved: 10,
      });
    });

    it('should return null for non-existing store', () => {
      const result = StoreAllocationHelper.getStoreAllocation(
        sampleAllocations,
        'non-existing-store',
      );

      expect(result).toBeNull();
    });

    it('should return null for null allocations', () => {
      const result = StoreAllocationHelper.getStoreAllocation(
        null,
        mockStoreId1,
      );
      expect(result).toBeNull();
    });

    it('should return null for undefined allocations', () => {
      const result = StoreAllocationHelper.getStoreAllocation(
        undefined,
        mockStoreId1,
      );
      expect(result).toBeNull();
    });

    it('should return null for empty store ID', () => {
      const result = StoreAllocationHelper.getStoreAllocation(
        sampleAllocations,
        '',
      );
      expect(result).toBeNull();
    });
  });

  describe('getTotalAllocated', () => {
    it('should return sum of all allocated quantities', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 100,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
        [mockStoreId2]: {
          allocated: 50,
          reserved: 5,
          lastUpdated: '2023-01-02T00:00:00.000Z',
          updatedBy: 'user-2',
        },
      };

      const result = StoreAllocationHelper.getTotalAllocated(allocations);
      expect(result).toBe(150);
    });

    it('should return 0 for empty allocations', () => {
      const result = StoreAllocationHelper.getTotalAllocated({});
      expect(result).toBe(0);
    });

    it('should return 0 for null allocations', () => {
      const result = StoreAllocationHelper.getTotalAllocated(null);
      expect(result).toBe(0);
    });

    it('should return 0 for undefined allocations', () => {
      const result = StoreAllocationHelper.getTotalAllocated(undefined);
      expect(result).toBe(0);
    });

    it('should handle single store allocation', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 75,
          reserved: 7,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
      };

      const result = StoreAllocationHelper.getTotalAllocated(allocations);
      expect(result).toBe(75);
    });
  });

  describe('getTotalReserved', () => {
    it('should return sum of all reserved quantities', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 100,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
        [mockStoreId2]: {
          allocated: 50,
          reserved: 5,
          lastUpdated: '2023-01-02T00:00:00.000Z',
          updatedBy: 'user-2',
        },
      };

      const result = StoreAllocationHelper.getTotalReserved(allocations);
      expect(result).toBe(15);
    });

    it('should return 0 for empty allocations', () => {
      const result = StoreAllocationHelper.getTotalReserved({});
      expect(result).toBe(0);
    });

    it('should return 0 for null allocations', () => {
      const result = StoreAllocationHelper.getTotalReserved(null);
      expect(result).toBe(0);
    });
  });

  describe('getAllocatedStoreIds', () => {
    it('should return array of store IDs', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 100,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
        [mockStoreId2]: {
          allocated: 50,
          reserved: 5,
          lastUpdated: '2023-01-02T00:00:00.000Z',
          updatedBy: 'user-2',
        },
      };

      const result = StoreAllocationHelper.getAllocatedStoreIds(allocations);
      expect(result).toEqual(
        expect.arrayContaining([mockStoreId1, mockStoreId2]),
      );
      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty allocations', () => {
      const result = StoreAllocationHelper.getAllocatedStoreIds({});
      expect(result).toEqual([]);
    });

    it('should return empty array for null allocations', () => {
      const result = StoreAllocationHelper.getAllocatedStoreIds(null);
      expect(result).toEqual([]);
    });
  });

  describe('hasStoreAllocation', () => {
    const allocations: StoreAllocations = {
      [mockStoreId1]: {
        allocated: 100,
        reserved: 10,
        lastUpdated: '2023-01-01T00:00:00.000Z',
        updatedBy: mockUserId,
      },
    };

    it('should return true for existing store', () => {
      const result = StoreAllocationHelper.hasStoreAllocation(
        allocations,
        mockStoreId1,
      );
      expect(result).toBe(true);
    });

    it('should return false for non-existing store', () => {
      const result = StoreAllocationHelper.hasStoreAllocation(
        allocations,
        mockStoreId2,
      );
      expect(result).toBe(false);
    });

    it('should return false for null allocations', () => {
      const result = StoreAllocationHelper.hasStoreAllocation(
        null,
        mockStoreId1,
      );
      expect(result).toBe(false);
    });

    it('should return false for empty allocations', () => {
      const result = StoreAllocationHelper.hasStoreAllocation({}, mockStoreId1);
      expect(result).toBe(false);
    });
  });

  describe('removeStoreAllocation', () => {
    it('should remove store allocation', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 100,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
        [mockStoreId2]: {
          allocated: 50,
          reserved: 5,
          lastUpdated: '2023-01-02T00:00:00.000Z',
          updatedBy: 'user-2',
        },
      };

      const result = StoreAllocationHelper.removeStoreAllocation(
        allocations,
        mockStoreId1,
      );

      expect(result[mockStoreId1]).toBeUndefined();
      expect(result[mockStoreId2]).toEqual(allocations[mockStoreId2]);
    });

    it('should not mutate original allocations', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 100,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
      };

      StoreAllocationHelper.removeStoreAllocation(allocations, mockStoreId1);

      expect(allocations[mockStoreId1]).toBeDefined();
    });

    it('should return empty object for null allocations', () => {
      const result = StoreAllocationHelper.removeStoreAllocation(
        null,
        mockStoreId1,
      );
      expect(result).toEqual({});
    });

    it('should return original allocations for empty store ID', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 100,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
      };

      const result = StoreAllocationHelper.removeStoreAllocation(
        allocations,
        '',
      );
      expect(result).toEqual(allocations);
    });
  });

  describe('validateTotalAllocations', () => {
    it('should return true when total allocations equal batch quantity', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 60,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
        [mockStoreId2]: {
          allocated: 40,
          reserved: 5,
          lastUpdated: '2023-01-02T00:00:00.000Z',
          updatedBy: 'user-2',
        },
      };

      const result = StoreAllocationHelper.validateTotalAllocations(
        allocations,
        100,
      );
      expect(result).toBe(true);
    });

    it('should return true when total allocations are less than batch quantity', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 50,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
      };

      const result = StoreAllocationHelper.validateTotalAllocations(
        allocations,
        100,
      );
      expect(result).toBe(true);
    });

    it('should return false when total allocations exceed batch quantity', () => {
      const allocations: StoreAllocations = {
        [mockStoreId1]: {
          allocated: 80,
          reserved: 10,
          lastUpdated: '2023-01-01T00:00:00.000Z',
          updatedBy: mockUserId,
        },
        [mockStoreId2]: {
          allocated: 30,
          reserved: 5,
          lastUpdated: '2023-01-02T00:00:00.000Z',
          updatedBy: 'user-2',
        },
      };

      const result = StoreAllocationHelper.validateTotalAllocations(
        allocations,
        100,
      );
      expect(result).toBe(false);
    });

    it('should return true for empty allocations', () => {
      const result = StoreAllocationHelper.validateTotalAllocations({}, 100);
      expect(result).toBe(true);
    });

    it('should return true for null allocations', () => {
      const result = StoreAllocationHelper.validateTotalAllocations(null, 100);
      expect(result).toBe(true);
    });
  });
});
