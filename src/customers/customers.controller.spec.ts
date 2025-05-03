import { Test, TestingModule } from '@nestjs/testing';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MESSAGES } from '../constants';
import { mockUsersResponseData } from '../../src/../test/mockData/user';
import { plainToInstance } from 'class-transformer';
import { UserEntity } from '../users/entity/user.entity';
import { ListUsersQueryDto } from '../users/dto/list-users.dto';

describe('CustomersController', () => {
  let controller: CustomersController;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

  const mockCustomerService = {
    createCustomer: jest.fn(),
    getUsers: jest.fn(),
    fetchUser: jest.fn(),
    deleteUser: jest.fn(),
    getCustomerTabs: jest.fn(),
  };

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        {
          provide: CustomersService,
          useValue: mockCustomerService,
        },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<CustomersController>(CustomersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create customer', () => {
    const mockDto: CreateCustomerDto = {
      firstname: 'James',
      lastname: 'Lewis',
      email: 'jo2@example.com',
      phone: '+1234567890',
      addressType: 'HOME',
      location: 'New York, USA',
      longitude: '',
      latitude: '',
    };

    it('should create a customer with credentials', async () => {
      const mockUserId = 'user-id';

      mockCustomerService.createCustomer.mockResolvedValue({
        message: MESSAGES.CREATED,
      });

      expect(await controller.create(mockDto, mockUserId)).toEqual({
        message: MESSAGES.CREATED,
      });
      expect(mockCustomerService.createCustomer).toHaveBeenCalledWith(
        mockUserId,
        mockDto,
      );
    });

    it('should throw error customer with email exists already', async () => {
      const dto: CreateCustomerDto = { ...mockDto };

      const mockCreatorId = 'creator-id';

      mockCustomerService.createCustomer.mockRejectedValue(
        new BadRequestException('Email already exists'),
      );

      await expect(controller.create(dto, mockCreatorId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('List Customers', () => {
    it('should return a list of paginated customerss', async () => {
      const paginatedUsers = {
        users: plainToInstance(UserEntity, mockUsersResponseData),
        total: 1,
        page: '1',
        limit: '10',
        totalPages: 1,
      };

      const query: ListUsersQueryDto = { page: '1', limit: '10' };
      mockCustomerService.getUsers.mockResolvedValueOnce(paginatedUsers);

      const result = await controller.listCustomers(query);
      expect(result).toMatchObject(paginatedUsers);
      expect(mockCustomerService.getUsers).toHaveBeenCalledWith(query);
    });
  });

  describe('Fetch Customer', () => {
    it('should return a customer if found', async () => {
      const userEntity = plainToInstance(UserEntity, mockUsersResponseData[0]);
      mockCustomerService.fetchUser.mockResolvedValueOnce(userEntity);

      const result = await controller.fetchCustomer('66e9fe02014ca14746800d33');
      expect(result).toEqual(userEntity);
      expect(mockCustomerService.fetchUser).toHaveBeenCalledWith(
        '66e9fe02014ca14746800d33',
      );
    });

    it('should throw NotFoundException if customer is not found', async () => {
      mockCustomerService.fetchUser.mockRejectedValueOnce(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );

      await expect(controller.fetchCustomer('nonexistent-id')).rejects.toThrow(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );
      expect(mockCustomerService.fetchUser).toHaveBeenCalledWith(
        'nonexistent-id',
      );
    });
  });

  describe('Delete Customer', () => {
    it('should call deleteUser service method and return success message', async () => {
      mockCustomerService.deleteUser.mockResolvedValueOnce({
        message: MESSAGES.DELETED,
      });

      const result = await controller.deleteUser('66e9fe02014ca14746800d33');
      expect(result).toEqual({ message: MESSAGES.DELETED });
      expect(mockCustomerService.deleteUser).toHaveBeenCalledWith(
        '66e9fe02014ca14746800d33',
      );
    });

    it('should throw NotFoundException if user to delete is not found', async () => {
      mockCustomerService.deleteUser.mockRejectedValueOnce(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );

      await expect(controller.deleteUser('nonexistent-id')).rejects.toThrow(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );
      expect(mockCustomerService.deleteUser).toHaveBeenCalledWith(
        'nonexistent-id',
      );
    });
  });

  describe('Fetch Customer Tabs', () => {
    const customerId = '672a7ded6e6ef96f18f3646c';
    it('should return customer Tabs if ID valid', async () => {
      mockCustomerService.getCustomerTabs.mockResolvedValueOnce([
        {
          name: 'Customer Details',
          url: `/customers/single/${customerId}`,
        },
        {
          name: 'RgistrationHistory',
          url: `/customers/${customerId}/registration-history`,
        },
        {
          name: 'Products',
          url: `/customers/${customerId}/products`,
        },
        {
          name: 'Contracts',
          url: `/customers/${customerId}/contracts`,
        },
        {
          name: 'Transactions',
          url: `/customers/${customerId}/transactions`,
        },
        {
          name: 'Tickets',
          url: `/customers/${customerId}/tickets`,
        },
      ]);

      const result = await controller.getCustomerTabs(
        customerId,
      );

      expect(result.length).toBeGreaterThan(1);
      expect(mockCustomerService.getCustomerTabs).toHaveBeenCalledWith(
        customerId,
      );
    });

    it('should throw NotFoundException if customer is not found', async () => {
      mockCustomerService.getCustomerTabs.mockRejectedValueOnce(
        new NotFoundException(MESSAGES.USER_NOT_FOUND),
      );

      await expect(
        controller.getCustomerTabs('nonexistent-id'),
      ).rejects.toThrow(new NotFoundException(MESSAGES.USER_NOT_FOUND));
      expect(mockCustomerService.getCustomerTabs).toHaveBeenCalledWith(
        'nonexistent-id',
      );
    });
  });
});
