import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { ActionEnum, PrismaClient, SubjectEnum } from '@prisma/client';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  describe('create', () => {
    it('should create a new permission', async () => {
      const createPermissionDto: CreatePermissionDto = {
        action: 'read',
        subject: 'all',
      };

      mockPrismaService.permission.findFirst.mockResolvedValue(null);
    
      mockPrismaService.permission.create.mockResolvedValue({
        id: '66f4237486d300545d3b1f10',
        ...createPermissionDto,
        roleIds: ["role-id"],
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      });

      const result = await service.create(createPermissionDto);

      expect(result).toHaveProperty("id");
      expect(mockPrismaService.permission.create).toHaveBeenCalledWith({
        data: createPermissionDto,
      });
    });
  });

  describe('findAll', () => {
    it('should return all permissions', async () => {
      const permissions = [
        {
          id: '66f4237486d300545d3b1f10',
          action: ActionEnum.manage,
          subject: SubjectEnum.all,
          roleIds: ['role-id'],
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
        // { id: '66f42a3166aaf6fbb2a643bf', action: 'write', subject: 'none' },
      ];

      mockPrismaService.permission.findMany.mockResolvedValue(permissions);

      const result = await service.findAll();

      expect(result).toEqual(permissions);
      expect(mockPrismaService.permission.findMany).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a permission by ID', async () => {
      const permission = {
        id: '66f4237486d300545d3b1f10',
        action: ActionEnum.manage,
        subject: SubjectEnum.all,
        roleIds: ['role-id'],
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      mockPrismaService.permission.findUnique.mockResolvedValue(permission);

      const result = await service.findOne('66f4237486d300545d3b1f10');

      expect(result).toEqual(permission);
      expect(mockPrismaService.permission.findUnique).toHaveBeenCalledWith({ where: { id: '66f4237486d300545d3b1f10' } });
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      mockPrismaService.permission.findUnique.mockResolvedValue(null);

      await expect(service.findOne('66f42a3166aaf6fbb2a643bf')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a permission', async () => {
      const updatePermissionDto: UpdatePermissionDto = {
        action: 'write',
        subject: 'all',
      };

      const existingPermission = {
        id: '66f4237486d300545d3b1f10',
        action: ActionEnum.manage,
        subject: SubjectEnum.all,
        roleIds: ['role-id'],
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      mockPrismaService.permission.findUnique.mockResolvedValue(existingPermission);
      mockPrismaService.permission.update.mockResolvedValue({ ...existingPermission, ...updatePermissionDto });

      const result = await service.update('66f4237486d300545d3b1f10', updatePermissionDto);

      expect(result).toEqual({ message: `Permission with ID 66f4237486d300545d3b1f10 updated successfully`, data: { ...existingPermission, ...updatePermissionDto } });
      expect(mockPrismaService.permission.update).toHaveBeenCalledWith({
        where: { id: '66f4237486d300545d3b1f10' },
        data: updatePermissionDto,
      });
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      mockPrismaService.permission.findUnique.mockResolvedValue(null);

      const updatePermissionDto: UpdatePermissionDto = {
        action: 'write',
        subject: 'all',
      };

      await expect(service.update('66f42a3166aaf6fbb2a643bf', updatePermissionDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a permission', async () => {
      const existingPermission = {
        id: '66f4237486d300545d3b1f10',
        action: ActionEnum.manage,
        subject: SubjectEnum.all,
        roleIds: ['role-id'],
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };
      mockPrismaService.permission.findUnique.mockResolvedValue(existingPermission);
      // mockPrismaService.permission.delete.mockRejectValue({ message: 'Permission deleted successfully' });

      const result = await service.remove('66f4237486d300545d3b1f10');

      expect(result).toEqual({ message: "Permission deleted successfully" });
      expect(mockPrismaService.permission.delete).toHaveBeenCalledWith({ where: { id: '66f4237486d300545d3b1f10' } });
    });

    it('should throw NotFoundException if permission does not exist', async () => {
      mockPrismaService.permission.findUnique.mockResolvedValue(null);

      await expect(service.remove('66f42a3166aaf6fbb2a643bf')).rejects.toThrow(NotFoundException);
    });
  });
});
