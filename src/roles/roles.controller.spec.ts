import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { NotFoundException } from '@nestjs/common';

const mockRole = {
  id: '66f4237486d300545d3b1f10',
  role: 'admin123',
  active: true,
  permissions: [],
};

const mockRolesService = {
  create: jest.fn().mockResolvedValue(mockRole),
  findAll: jest.fn().mockResolvedValue([mockRole]),
  findOne: jest.fn().mockResolvedValue(mockRole),
  update: jest.fn().mockResolvedValue(mockRole),
  remove: jest.fn().mockResolvedValue(mockRole),
};

describe('RolesController', () => {
  let controller: RolesController;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        { provide: RolesService, useValue: mockRolesService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a new role', async () => {
    const createRoleDto: CreateRoleDto = {
      role: 'admin123',
      active: true,
      permissionIds: [],
    };
    const result = await controller.create(createRoleDto, 'user-id');
    expect(result).toEqual(mockRole);
  });

  it('should find all roles', async () => {
    const roles = await controller.findAll();
    expect(roles).toEqual([mockRole]);
  });

  it('should find one role by id', async () => {
    const role = await controller.findOne('66f4237486d300545d3b1f10');
    expect(role).toEqual(mockRole);
  });

  it('should throw NotFoundException if role not found', async () => {
    mockRolesService.findOne = jest.fn().mockResolvedValue(null);

    await expect(
      controller.findOne('66f42a3166aaf6fbb2a643bf'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should update a role', async () => {
    const updateData = { role: 'user', active: false, permissionIds: [] };
    const updatedRole = await controller.update(
      '66f4237486d300545d3b1f10',
      updateData,
    );
    expect(updatedRole).toEqual(mockRole);
  });

  it('should throw NotFoundException on update if role not found', async () => {
    mockRolesService.update = jest
      .fn()
      .mockRejectedValue(new NotFoundException());

    await expect(
      controller.update('66f42a3166aaf6fbb2a643bf', {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete a role', async () => {
    const deletedRole = await controller.remove('66f4237486d300545d3b1f10');
    expect(deletedRole).toEqual({ message: 'Role deleted successfully' });
  });

  it('should throw NotFoundException on delete if role not found', async () => {
    mockRolesService.remove = jest
      .fn()
      .mockRejectedValue(new NotFoundException());

    await expect(controller.remove('66f42a3166aaf6fbb2a643bf')).rejects.toThrow(
      NotFoundException,
    );
  });
});
