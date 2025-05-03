import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersModule } from '../src/users/users.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt.guard';
import { RolesAndPermissionsGuard } from '../src/auth/guards/roles.guard';
import { mockUsersResponseData } from './mockData/user';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

  beforeAll(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesAndPermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('List users', () => {
    it('/users (GET)', async () => {
      mockPrismaService.user.findMany.mockResolvedValueOnce(
        mockUsersResponseData,
      );
      mockPrismaService.user.count.mockResolvedValueOnce(1);

      const response = await request(app.getHttpServer())
        .get('/users?page=1&limit=10')
        .expect(200);

      expect(response.body.users.length).toBeGreaterThan(0);
      expect(response.body.total).toBeTruthy();
      expect(response.body.page).toBeTruthy();
      expect(response.body.limit).toBeTruthy();
    });
  });

  describe('Update user', () => {
    it('should return 404 if user is not found', () => {
      return request(app.getHttpServer())
        .patch('/users/nonexistent-id')
        .set('Authorization', 'Bearer valid_token')
        .send({ username: 'newusername' })
        .expect(404);
    });

    it('should return 400 if the update payload is empty', () => {
      return request(app.getHttpServer())
        .patch('/users/existing-id')
        .set('Authorization', 'Bearer valid_token')
        .send({})
        .expect(400);
    });

    it('should update the user profile successfully', async () => {
      const mockUser = {
        id: 'test-id',
        username: 'testuser',
        email: 'testuser@example.com',
        password: 'password',
      };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValueOnce(
        mockUser,
      );
      (mockPrismaService.user.update as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        username: 'updateduser',
      });

      return request(app.getHttpServer())
        .patch(`/users/${mockUser.id}`)
        .set('Authorization', 'Bearer valid_token')
        .send({ username: 'updateduser' })
        .expect(200)
        .then((response) => {
          expect(response.body.username).toBe('updateduser');
        });
    });
  });
});
