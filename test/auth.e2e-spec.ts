import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient, TokenType } from '@prisma/client';
import {
  ExecutionContext,
  HttpStatus,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { AuthModule } from './../src/auth/auth.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { EmailService } from './../src/mailer/email.service';
import { MESSAGES } from '../src/constants';
import { CreateUserDto } from '../src/auth/dto/create-user.dto';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';
import { JwtAuthGuard } from '../src/auth/guards/jwt.guard';
import { RolesAndPermissionsGuard } from '../src/auth/guards/roles.guard';
import { fakeData } from './mockData/user';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('../src/utils/helpers.util', () => ({
  hashPassword: jest.fn().mockResolvedValue(expect.any(String)),
}));

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

  const mockEmailService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const testData: CreateUserDto = {
    firstname: 'John',
    lastname: 'Doe',
    email: 'john.test-data@example.com',
    phone: '09062736182',
    role: '66dce4173c5d3bc2fd5f5728',
    location: 'Abuja',
  };

  const tokenData = {
    id: 'token-id',
    userId: '62a23958e5a9e9b88f853a67',
    token_type: TokenType.password_reset,
    token: 'token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const mockUser = {
    id: fakeData.id,
    email: fakeData.email,
    password: fakeData.password,
  };

  const mockAccessToken = 'token';

  beforeEach(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(EmailService)
      .useValue(mockEmailService)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 'abc123' };
          return true;
        },
      })
      .overrideGuard(RolesAndPermissionsGuard)
      .useValue({})
      .overrideProvider(JwtService)
      .useValue(mockJwtService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Add user', () => {
    it('/auth/add-user (POST) should add a new user', async () => {
      const dto: CreateUserDto = { ...testData };

      (mockPrismaService.user.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrismaService.role.findFirst as jest.Mock).mockResolvedValue({
        name: 'admin',
      });

      (mockPrismaService.user.create as jest.Mock).mockResolvedValue({
        ...dto,
      });

      (mockPrismaService.tempToken.create as jest.Mock).mockResolvedValue(tokenData);

      const response = await request(app.getHttpServer())
        .post('/auth/add-user')
        .set('Authorization', 'Bearer valid_token')
        .send(testData)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('firstname');
      expect(mockEmailService.sendMail).toHaveBeenCalled();
    }, 10000);

    it('/auth/add-user (POST) should return HttpStatus.BAD_REQUEST if email already exists', async () => {
      const { role, ...dataWithoutRole } = testData;
      console.log({ role });

      await mockPrismaService.user.create({
        data: {
          ...dataWithoutRole,
          roleId: '66dce4173c5d3bc2fd5f5728',
          password: 'hashedPwd',
        },
      });

      await request(app.getHttpServer())
        .post('/auth/add-user')
        .send({
          testData,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Login', () => {
    it('/auth/login (POST) should return a user with access token', async () => {
      // Set up the mock implementations
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(
        mockUser,
      );
      (argon.verify as jest.Mock).mockResolvedValue(true);
      (mockJwtService.sign as jest.Mock).mockReturnValue(mockAccessToken);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testData.email, password: 'password' })
        .expect(HttpStatus.OK);

      expect(response.headers['access_token']).toBeDefined();
      expect(response.body).toHaveProperty('id');
    });

    it('should block requests above the rate limit', async () => {
      // Set up the mock implementations
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(
        mockUser,
      );
      (argon.verify as jest.Mock).mockResolvedValue(true);
      (mockJwtService.sign as jest.Mock).mockReturnValue(mockAccessToken);

      const rateLimit = 6;

      for (let i = 0; i < 10; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: testData.email, password: 'password' })
          .expect(
            i >= rateLimit ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.OK,
          );

        if (i >= rateLimit) {
          expect(response.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
          break;
        } else expect(response.status).toBe(HttpStatus.OK);
      }
    });
  });

  describe('Forgot Password', () => {
    it('/auth/forgot-password (POST) should send a reset password email if user exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(fakeData);
      (mockPrismaService.tempToken.create as jest.Mock).mockResolvedValue(
        tokenData,
      );

      const forgotPasswordData = { email: testData.email };

      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send(forgotPasswordData)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        message: MESSAGES.PWD_RESET_MAIL_SENT,
      });
      expect(mockEmailService.sendMail).toHaveBeenCalled();
    });

    it('/auth/forgot-password (POST) should return HttpStatus.BAD_REQUEST if user does not exist', async () => {
      const forgotPasswordData = { email: 'non-existent@example.com' };

      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send(forgotPasswordData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Reset Password', () => {
    it('/auth/reset-password (POST) should reset the password with a valid token', async () => {
      mockPrismaService.tempToken.findFirst.mockResolvedValue(tokenData);
      mockPrismaService.user.update.mockResolvedValue(fakeData);
      mockPrismaService.tempToken.update.mockResolvedValue(null);

      const resetPasswordData = {
        userid: '66dce4173c5d3bc2fd5f5728',
        newPassword: 'new-password',
        confirmNewPassword: 'new-password',
        resetToken: 'valid-token',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send(resetPasswordData)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual({
        message: MESSAGES.PWD_RESET_SUCCESS,
      });
    });

    it('/auth/reset-password (POST) should return HttpStatus.BAD_REQUEST with invalid or expired token', async () => {
      const resetPasswordData = {
        token: 'invalid-token',
        newPassword: 'new-password123',
      };

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send(resetPasswordData)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // describe('Verify Reset Token', () => {
    // it('/auth/verify-reset-token/:userid/token (POST) should verify a valid reset token', async () => {
    //   mockPrismaService.tempToken.findFirst.mockResolvedValue(tokenData);

    //   const response = await request(app.getHttpServer())
    //     .post(`/auth/verify-reset-token/${fakeData.id}/${tokenData.token}`)
    //     .expect(HttpStatus.OK);

    //   expect(response.body).toHaveProperty("id");
    // });

    // it('/auth/verify-email-verification-token/:userid/token  (POST) should verify a valid email verification token', async () => {
    //   mockPrismaService.tempToken.findFirst.mockResolvedValue(tokenData);

    //   const response = await request(app.getHttpServer())
    //     .post(
    //       `/auth/verify-email-verification-token/${fakeData.id}/${tokenData.token}`,
    //     )
    //     .expect(HttpStatus.OK);

    //   expect(response.body).toHaveProperty('id');
    // });

    // it('/auth/verify-reset-token/:userid/token  (POST) should return HttpStatus.BAD_REQUEST for an invalid or expired token', async () => {
    //   mockPrismaService.tempToken.findFirst.mockRejectedValue(
    //     new BadRequestException(MESSAGES.INVALID_TOKEN),
    //   );

    //   await request(app.getHttpServer())
    //     .post(`/auth/verify-reset-token/${fakeData.id}/${tokenData.token}`)
    //     .expect(HttpStatus.BAD_REQUEST);
    // });
  // });
});
