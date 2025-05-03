import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { UserEntity } from './entity/user.entity';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGES } from '../constants';
import { UpdateUserDto } from './dto/update-user.dto';
import { ListUsersQueryDto } from './dto/list-users.dto';
import { mockUsersResponseData } from '../../src/../test/mockData/user';

describe('UsersController', () => {
  let controller: UsersController;
  let userService: UsersService;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

  const mockUsersService = {
    getUsers: jest.fn(),
    updateUser: jest.fn(),
    fetchUser: jest.fn(),
    deleteUser: jest.fn(),
  };

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    userService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('List User', () => {
    it('should return a list of paginated users', async () => {
      const paginatedUsers = {
        users: plainToInstance(UserEntity, mockUsersResponseData),
        total: 1,
        page: '1',
        limit: '10',
        totalPages: 1,
      };

      const query: ListUsersQueryDto = { page: '1', limit: '10' };
      mockUsersService.getUsers.mockResolvedValueOnce(paginatedUsers);

      const result = await controller.listUsers(query);
      expect(result).toMatchObject(paginatedUsers);
      expect(userService.getUsers).toHaveBeenCalledWith(query);
    });
  });

  describe('Update User', () => {
    it('should throw BadRequestException if the DTO is empty', async () => {
      await expect(controller.updateUser('test-id', {})).rejects.toThrow(
        new BadRequestException(MESSAGES.EMPTY_OBJECT),
      );
    });

    it('should call updateUser service method', async () => {
      const updateUserDto: UpdateUserDto = { username: 'newusername' };
      const mockUser = { id: 'test-id', username: 'newusername' };
      mockUsersService.updateUser.mockResolvedValue(mockUser);

      const result = await controller.updateUser('test-id', updateUserDto);

      expect(result).toEqual(mockUser);
      expect(mockUsersService.updateUser).toHaveBeenCalledWith(
        'test-id',
        updateUserDto,
      );
    });
  });

  describe('Fetch User', () => {
    it('should return a user if found', async () => {
      const userEntity = plainToInstance(UserEntity, mockUsersResponseData[0]);
      mockUsersService.fetchUser.mockResolvedValueOnce(userEntity);

      const result = await controller.fetchUser('66e9fe02014ca14746800d33');
      expect(result).toEqual(userEntity);
      expect(mockUsersService.fetchUser).toHaveBeenCalledWith(
        '66e9fe02014ca14746800d33',
      );
    });

    it('should throw NotFoundException if user is not found', async () => {
      mockUsersService.fetchUser.mockRejectedValueOnce(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );

      await expect(controller.fetchUser('nonexistent-id')).rejects.toThrow(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );
      expect(mockUsersService.fetchUser).toHaveBeenCalledWith('nonexistent-id');
    });
  });

  describe('Delete User', () => {
    it('should call deleteUser service method and return success message', async () => {
      mockUsersService.deleteUser.mockResolvedValueOnce({
        message: MESSAGES.DELETED,
      });

      const result = await controller.deleteUser('66e9fe02014ca14746800d33');
      expect(result).toEqual({ message: MESSAGES.DELETED });
      expect(mockUsersService.deleteUser).toHaveBeenCalledWith(
        '66e9fe02014ca14746800d33',
      );
    });

    it('should throw NotFoundException if user to delete is not found', async () => {
      mockUsersService.deleteUser.mockRejectedValueOnce(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );

      await expect(controller.deleteUser('nonexistent-id')).rejects.toThrow(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );
      expect(mockUsersService.deleteUser).toHaveBeenCalledWith(
        'nonexistent-id',
      );
    });
  });
});
