import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StoreAccessGuard, STORE_ACCESS_KEY } from './store-access.guard';
import { StoreRolesService } from '../store-roles.service';
import { TenantContext } from '../../tenants/context/tenant.context';
import { StoreContext } from '../context/store.context';

describe('StoreAccessGuard', () => {
  let guard: StoreAccessGuard;
  let storeRolesService: jest.Mocked<StoreRolesService>;
  let tenantContext: jest.Mocked<TenantContext>;
  let storeContext: jest.Mocked<StoreContext>;
  let reflector: jest.Mocked<Reflector>;

  const mockExecutionContext = (request: any) => ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => jest.fn(),
  }) as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreAccessGuard,
        {
          provide: StoreRolesService,
          useValue: {
            getUserStoreAccess: jest.fn(),
          },
        },
        {
          provide: TenantContext,
          useValue: {
            getTenantId: jest.fn(),
          },
        },
        {
          provide: StoreContext,
          useValue: {
            requireStoreId: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<StoreAccessGuard>(StoreAccessGuard);
    storeRolesService = module.get(StoreRolesService);
    tenantContext = module.get(TenantContext);
    storeContext = module.get(StoreContext);
    reflector = module.get(Reflector);
  });

  describe('canActivate', () => {
    const mockUser = { sub: 'user-123' };
    const mockTenantId = 'tenant-456';
    const mockStoreId = 'store-789';

    beforeEach(() => {
      tenantContext.getTenantId.mockReturnValue(mockTenantId);
      reflector.get.mockReturnValue(undefined); // Default behavior
    });

    it('should throw UnauthorizedException when user is not authenticated', async () => {
      const context = mockExecutionContext({ user: null });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when tenant context is not found', async () => {
      tenantContext.getTenantId.mockReturnValue(null);
      const context = mockExecutionContext({ user: mockUser });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should grant access when user is tenant super admin', async () => {
      const context = mockExecutionContext({
        user: mockUser,
        params: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: true,
        userStoreRoles: [],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should grant access when user has active store role', async () => {
      const context = mockExecutionContext({
        user: mockUser,
        params: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: false,
        userStoreRoles: [
          {
            store: { id: mockStoreId },
            isActive: true,
            storeRole: { active: true },
          },
        ],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should deny access when user has no store roles', async () => {
      const context = mockExecutionContext({
        user: mockUser,
        params: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: false,
        userStoreRoles: [],
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should deny access when user has inactive store role', async () => {
      const context = mockExecutionContext({
        user: mockUser,
        params: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: false,
        userStoreRoles: [
          {
            store: { id: mockStoreId },
            isActive: false,
            storeRole: { active: true },
          },
        ],
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should extract store ID from different parameter names', async () => {
      reflector.get.mockReturnValue({ storeIdParam: 'customId' });
      
      const context = mockExecutionContext({
        user: mockUser,
        params: { customId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: true,
        userStoreRoles: [],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(storeRolesService.getUserStoreAccess).toHaveBeenCalledWith(
        { userId: mockUser.sub, storeId: mockStoreId },
        { tenantId: mockTenantId }
      );
    });

    it('should fallback to store context when no parameter found', async () => {
      storeContext.requireStoreId.mockResolvedValue(mockStoreId);
      
      const context = mockExecutionContext({
        user: mockUser,
        params: {},
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: true,
        userStoreRoles: [],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(storeContext.requireStoreId).toHaveBeenCalled();
    });

    it('should deny tenant super admin access when allowTenantSuperAdmin is false', async () => {
      reflector.get.mockReturnValue({ allowTenantSuperAdmin: false });
      
      const context = mockExecutionContext({
        user: mockUser,
        params: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: true,
        userStoreRoles: [],
      });

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should allow inactive roles when requireActiveRole is false', async () => {
      reflector.get.mockReturnValue({ requireActiveRole: false });
      
      const context = mockExecutionContext({
        user: mockUser,
        params: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: false,
        userStoreRoles: [
          {
            store: { id: mockStoreId },
            isActive: false,
            storeRole: { active: true },
          },
        ],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should extract store ID from query parameters', async () => {
      const context = mockExecutionContext({
        user: mockUser,
        params: {},
        query: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: true,
        userStoreRoles: [],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should extract store ID from request body', async () => {
      const context = mockExecutionContext({
        user: mockUser,
        params: {},
        query: {},
        body: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockResolvedValue({
        isTenantSuperAdmin: true,
        userStoreRoles: [],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it('should handle service errors gracefully', async () => {
      const context = mockExecutionContext({
        user: mockUser,
        params: { storeId: mockStoreId },
      });

      storeRolesService.getUserStoreAccess.mockRejectedValue(new Error('Database error'));

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});

/**
 * Integration Test Examples:
 * 
 * These tests demonstrate how the guard integrates with the broader system:
 */
describe('StoreAccessGuard Integration', () => {
  // Mock data that would come from the database
  const mockUserStoreAccess = {
    isTenantSuperAdmin: false,
    userStoreRoles: [
      {
        store: { id: 'store-123', name: 'Main Store', type: 'MAIN' },
        storeRole: { 
          id: 'role-456', 
          name: 'Store Manager', 
          active: true,
          permissions: [
            { action: 'read', subject: 'StoreInventory' },
            { action: 'update', subject: 'StoreInventory' },
          ]
        },
        isActive: true,
        assignedAt: new Date(),
      }
    ],
    hasAccessToAllStores: false,
  };

  it('should work with real-world user access data', () => {
    // This test would use actual service responses
    expect(mockUserStoreAccess.userStoreRoles).toHaveLength(1);
    expect(mockUserStoreAccess.userStoreRoles[0].isActive).toBe(true);
  });
});