import { Test, TestingModule } from '@nestjs/testing';
import { RolesService } from './roles.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const mockRole = {
  id: '66f42a3166aaf6fbb2a643bf',
  role: 'admin123',
  active: true,
  permissions: [],
};

const mockPrismaService = {
  role: {
    create: jest.fn().mockResolvedValue(mockRole),
    findUnique: jest.fn().mockResolvedValue(mockRole),
    findMany: jest.fn().mockResolvedValue([mockRole]),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(mockRole),
    delete: jest.fn().mockResolvedValue(mockRole),
  },
};

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a new role', async () => {
    mockPrismaService.role.findUnique = jest.fn().mockResolvedValue(null);
  
    const roleData = { role: 'admin123', created_by: '60d0fe4f5311236168a109cb', active: true, permissionIds: [] };
    const createdRole = await service.create(roleData, 'user-id');
    expect(createdRole).toEqual(mockRole);
  });
  

  it('should throw ConflictException if role already exists', async () => {
    mockPrismaService.role.findUnique = jest.fn().mockResolvedValue(mockRole);
    const roleData = { role: 'admin123', created_by: '60d0fe4f5311236168a109cb', active: true, permissionIds: [] };
    
    await expect(service.create(roleData, 'user-id')).rejects.toThrow(
      ConflictException,
    );
  });

  it('should find all roles', async () => {
    const roles = await service.findAll();
    expect(roles).toEqual([mockRole]);
  });

  it('should find one role by id', async () => {
    const role = await service.findOne('66f42a3166aaf6fbb2a643bf');
    expect(role).toEqual(mockRole);
  });

  it('should throw NotFoundException if role not found', async () => {
    mockPrismaService.role.findUnique = jest.fn().mockResolvedValue(null);
    
    await expect(service.findOne('66f4237486d300545d3b1f10')).rejects.toThrow(NotFoundException);
  });

  it('should update a role', async () => {
    const updateData = { role: 'user', active: false, permissionIds: [] };
    const updatedRole = await service.update('66f42a3166aaf6fbb2a643bf', updateData);
    expect(updatedRole).toEqual(mockRole);
  });

  // it('should throw NotFoundException on update if role not found', async () => {
  //   mockPrismaService.role.update = jest.fn().mockRejectedValue(new Error());
    
  //   await expect(service.update('66f4237486d300545d3b1f10', {})).rejects.toThrow(NotFoundException);
  // });

  it('should delete a role', async () => {
    const deletedRole = await service.remove('66f42a3166aaf6fbb2a643bf');
    expect(deletedRole).toEqual(mockRole);
  });

  // it('should throw NotFoundException on delete if role not found', async () => {
  //   mockPrismaService.role.delete = jest.fn().mockRejectedValue(new NotFoundException('Role not found'));
  
  //   await expect(service.remove('66f4237486d300545d3b1f10')).rejects.toThrow(NotFoundException);
  // });
  
});
