import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client'; 
import { PrismaService } from '../src/prisma/prisma.service';
// import { CreateRoleDto } from '../src/roles/dto/create-role.dto';
// import { UpdateRoleDto } from '../src/roles/dto/update-role.dto';
import * as request from 'supertest';
import { RolesModule } from '../src/roles/roles.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt.guard';
import { RolesAndPermissionsGuard } from '../src/auth/guards/roles.guard';

describe('RolesController (e2e)', () => {
  let app: INestApplication;
//   let rolesService: RolesService;
  let mockPrismaService: DeepMockProxy<PrismaClient>;

//   const mockRole = {
//     id: '66f4237486d300545d3b1f11',
//     role: 'Admin',
//     active: true,
//     permissionIds: ['66f4237486d300545d3b1f10'],
//   };

//   const mockUser = {
//     id: '66f4237486d300545d3b1f13',
//     username: 'testuser',
//     email: 'test@example.com',
//     password: 'securePassword123',
//     roleId: null,
//   };

  beforeAll(async () => {
    mockPrismaService = mockDeep<PrismaClient>();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RolesModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext ) => {
          const req = context.switchToHttp().getRequest();
          req.user = { id: 'abc123' };
          return true;
        },
      })
      .overrideGuard(RolesAndPermissionsGuard)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

//   it('should create a new role', async () => {
//     const createRoleDto: CreateRoleDto = {
//       role: 'Admin',
//       active: true,
//       permissionIds: ['66f4237486d300545d3b1f10'],
//     };

//     const response = await request(app.getHttpServer())
//       .post('/roles')
//       .send(createRoleDto)
//       .expect(201);

//     expect(response.body).toHaveProperty('id');
//     expect(response.body.role).toEqual(createRoleDto.role);
//     expect(response.body.active).toEqual(createRoleDto.active);
//   });

  it('should retrieve all roles', async () => {
    await request(app.getHttpServer())
      .get('/roles')
      .expect(200);

    // expect(response.body).toHaveLength(1);
    // expect(response.body[0].role).toEqual(mockRole.role);
  });

//   it('should retrieve a role by ID', async () => {
//     const response = await request(app.getHttpServer())
//       .get(`/roles/${mockRole.id}`)
//       .expect(200);

//     expect(response.body.id).toEqual(mockRole.id);
//     expect(response.body.role).toEqual(mockRole.role);
//   });

//   it('should update a role', async () => {
//     const updateRoleDto: UpdateRoleDto = {
//       role: 'SuperAdmin',
//       active: false,
//     };

//     const response = await request(app.getHttpServer())
//       .put(`/roles/${mockRole.id}`)
//       .send(updateRoleDto)
//       .expect(200);

//     expect(response.body.role).toEqual(updateRoleDto.role);
//     expect(response.body.active).toEqual(updateRoleDto.active);
//   });

//   it('should delete a role', async () => {
//     await request(app.getHttpServer())
//       .delete(`/roles/${mockRole.id}`)
//       .expect(404);

//     const response = await request(app.getHttpServer())
//       .get(`/roles/${mockRole.id}`)
//       .expect(404);

//     expect(response.body.message).toEqual(
//       `Role with ID ${mockRole.id} not found`,
//     );
//   });

//   it('should assign a user to a role', async () => {
//     const response = await request(app.getHttpServer())
//       .post(`/roles/${mockUser.id}/assign`)
//       .send({ roleId: mockRole.id })
//       .expect(201);

//     expect(response.body.message).toEqual('User assigned to role successfully');
//   });
});
