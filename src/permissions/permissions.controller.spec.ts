import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { NotFoundException } from '@nestjs/common';

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

  const mockPermissionsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new permission', async () => {
      const createPermissionDto: CreatePermissionDto = {
        action: 'read',
        subject: 'all',
      };
      mockPermissionsService.create.mockResolvedValue({
        id: '66f4237486d300545d3b1f10',
        ...createPermissionDto,
      });

      const result = await controller.create(createPermissionDto);

      expect(result).toEqual({
        id: '66f4237486d300545d3b1f10',
        ...createPermissionDto,
      });
      expect(mockPermissionsService.create).toHaveBeenCalledWith(
        createPermissionDto,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of permissions', async () => {
      const permissions = [
        { id: '66f4237486d300545d3b1f10', action: 'read', subject: 'all' },
        { id: '66f42a3166aaf6fbb2a643bf', action: 'write', subject: 'none' },
      ];
      mockPermissionsService.findAll.mockResolvedValue(permissions);

      const result = await controller.findAll();

      expect(result).toEqual(permissions);
      expect(mockPermissionsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a permission by ID', async () => {
      const permission = {
        id: '66f4237486d300545d3b1f10',
        action: 'read',
        subject: 'all',
      };
      mockPermissionsService.findOne.mockResolvedValue(permission);

      const result = await controller.findOne('66f4237486d300545d3b1f10');

      expect(result).toEqual(permission);
      expect(mockPermissionsService.findOne).toHaveBeenCalledWith(
        '66f4237486d300545d3b1f10',
      );
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      // Here we reject the promise with an actual error
      mockPermissionsService.findOne.mockRejectedValue(
        new NotFoundException('Permission not found'),
      );

      await expect(
        controller.findOne('66f42a3166aaf6fbb2a643bf'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a permission', async () => {
      const updatePermissionDto: UpdatePermissionDto = {
        action: 'write',
        subject: 'all',
      };
      const updatedPermission = {
        id: '66f4237486d300545d3b1f10',
        ...updatePermissionDto,
      };

      mockPermissionsService.update.mockResolvedValue({
        message: `Permission with ID 66f4237486d300545d3b1f10 updated successfully`,
        data: updatedPermission,
      });

      const result = await controller.update(
        '66f4237486d300545d3b1f10',
        updatePermissionDto,
      );

      expect(result).toEqual({
        message: `Permission with ID 66f4237486d300545d3b1f10 updated successfully`,
        data: updatedPermission,
      });
      expect(mockPermissionsService.update).toHaveBeenCalledWith(
        '66f4237486d300545d3b1f10',
        updatePermissionDto,
      );
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      const updatePermissionDto: UpdatePermissionDto = {
        action: 'write',
        subject: 'all',
      };

      mockPermissionsService.update.mockRejectedValue(
        new NotFoundException('Permission not found'),
      );

      await expect(
        controller.update('66f42a3166aaf6fbb2a643bf', updatePermissionDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a permission', async () => {
      mockPermissionsService.remove.mockResolvedValue({
        message: 'Permission deleted successfully',
      });

      const result = await controller.remove('66f4237486d300545d3b1f10');

      expect(result).toEqual({ message: 'Permission deleted successfully' });
      expect(mockPermissionsService.remove).toHaveBeenCalledWith(
        '66f4237486d300545d3b1f10',
      );
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      mockPermissionsService.remove.mockRejectedValue(
        new NotFoundException('Permission not found'),
      );

      await expect(
        controller.remove('66f42a3166aaf6fbb2a643bf'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
