import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { MESSAGES } from '../constants';
import { PasswordResetDTO } from './dto/password-reset.dto';
import { LoginUserDTO } from './dto/login-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateSuperUserDto } from './dto/create-super-user.dto';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    addUser: jest.fn((dto) => {
      return {
        id: 'user-id',
        ...dto,
      };
    }),
    login: jest.fn(),
    verifyResetToken: jest.fn(),
    verifyToken: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    createSuperuser: jest.fn(),
    createUserPassword: jest.fn(),
    changePassword: jest.fn(),
  };

  let mockPrismaService: DeepMockProxy<PrismaClient>;

  const testData = {
    firstname: 'John',
    lastname: 'Doe',
    email: 'john.doe@example.com',
    phone: '09062736182',
    role: '66dce4173c5d3b2fd5f5728',
    location: 'Abuja',
  };

  const loginCred: LoginUserDTO = {
    email: testData.email,
    password: 'password',
  };

  const resetPwdData: PasswordResetDTO = {
    userid: 'user-id',
    newPassword: 'new-password',
    confirmNewPassword: 'new-password',
    resetToken: 'valid-reset-token',
  };

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('addUser', () => {
    it('should add a user', async () => {
      const dto: CreateUserDto = { ...testData };

      const result = { id: 'user-id', ...dto };
      mockAuthService.addUser.mockResolvedValue(result);

      expect(await controller.addUser(dto)).toEqual(result);
      expect(mockAuthService.addUser).toHaveBeenCalledWith(dto);
    });

    it('should throw BadRequestException when service throws', async () => {
      const dto: CreateUserDto = { ...testData };

      mockAuthService.addUser.mockRejectedValue(
        new BadRequestException('Email already exists'),
      );

      await expect(controller.addUser(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('login', () => {
    it('should return user information and set accessToken header', async () => {
      const mockUser = { id: 'user-id', email: 'test@example.com' };
      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      mockAuthService.login.mockResolvedValue(mockUser);

      await controller.login(loginCred, mockRes);

      expect(mockAuthService.login).toHaveBeenCalledWith(loginCred, mockRes);
    });

    it('should handle UnauthorizedException', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      mockAuthService.login.mockRejectedValue(new UnauthorizedException());

      await expect(controller.login(loginCred, mockRes)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle InternalServerErrorException', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;

      mockAuthService.login.mockRejectedValue(
        new InternalServerErrorException(),
      );

      await expect(controller.login(loginCred, mockRes)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('forgotPassword', () => {
    const forgotPasswordDTO = { email: testData.email };

    it('should call forgotPassword and return a success message', async () => {
      const message = { message: MESSAGES.PWD_RESET_MAIL_SENT };
      mockAuthService.forgotPassword.mockResolvedValue(message);

      expect(await controller.forgotPassword(forgotPasswordDTO)).toEqual(
        message,
      );
      expect(authService.forgotPassword).toHaveBeenCalledWith(
        forgotPasswordDTO,
      );
    });

    it('should throw BadRequestException when service throws', async () => {
      mockAuthService.forgotPassword.mockRejectedValue(
        new BadRequestException(MESSAGES.USER_NOT_FOUND),
      );

      await expect(
        controller.forgotPassword(forgotPasswordDTO),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyResetTokens', () => {
    const verificationParams = {
      userid: 'user-id',
      token: 'valid-reset-token',
    };

    it('should verify reset token', async () => {
      const response = { message: MESSAGES.TOKEN_VALID };

      mockAuthService.verifyToken.mockResolvedValue(response);

      expect(
        await controller.verifyResetToken(verificationParams),
      ).toBeDefined();

      expect(mockAuthService.verifyToken).toHaveBeenCalled();
      
      expect(
        await controller.verifyEmailVerficationToken(verificationParams),
      ).toBeDefined();

      expect(mockAuthService.verifyToken).toHaveBeenCalled();
    });

    it('should throw BadRequestException when service throws', async () => {
      mockAuthService.verifyToken.mockRejectedValue(
        new BadRequestException(MESSAGES.INVALID_TOKEN),
      );

      await expect(
        controller.verifyResetToken(verificationParams),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetPassword', () => {
    it('should reset password', async () => {
      const response = { message: MESSAGES.PWD_RESET_SUCCESS };

      mockAuthService.resetPassword.mockResolvedValue(response);

      expect(await controller.resetPassword(resetPwdData)).toEqual(response);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(resetPwdData);
    });

    it('should throw BadRequestException when service throws', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException(MESSAGES.INVALID_TOKEN),
      );

      await expect(controller.resetPassword(resetPwdData)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('changePassword', () => {
    const changePasswordData: ChangePasswordDto = {
      oldPassword: 'old-password',
      password: 'new-password',
      confirmPassword: 'new-password',
    };

    it('should change password successfully', async () => {
      const response = { message: MESSAGES.PASSWORD_CHANGED_SUCCESS };
      mockAuthService.changePassword.mockResolvedValue(response);

      expect(
        await controller.changePassword(changePasswordData, 'user-id'),
      ).toEqual(response);
      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        changePasswordData,
        'user-id',
      );
    });

    it('should throw BadRequestException when service throws', async () => {
      mockAuthService.changePassword.mockRejectedValue(
        new BadRequestException('Current password is incorrect'),
      );

      await expect(
        controller.changePassword(changePasswordData, 'user-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createSuperuser', () => {
    const createSuperuserData: CreateSuperUserDto = {
      firstname: 'John',
      lastname: 'Doe',
      email: 'john.doe@example.com',
      cKey: '09062736182',
      password: '66dce4173c5d3b2fd5f5728',
    };

    it('should create a superuser', async () => {
      const result = {
        id: 'superuser-id',
        ...createSuperuserData,
        password: undefined,
      };
      mockAuthService.createSuperuser.mockResolvedValue(result);

      expect(await controller.createSuperuser(createSuperuserData)).toEqual(
        result,
      );
      expect(mockAuthService.createSuperuser).toHaveBeenCalledWith(
        createSuperuserData,
      );
    });

    it('should throw BadRequestException when service throws', async () => {
      mockAuthService.createSuperuser.mockRejectedValue(
        new BadRequestException('Invalid data'),
      );

      await expect(
        controller.createSuperuser(createSuperuserData),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
