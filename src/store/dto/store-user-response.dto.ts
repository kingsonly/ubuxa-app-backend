import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class StoreUserResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '507f1f77bcf86cd799439011',
  })
  id: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstname: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastname: string;

  @ApiProperty({
    description: 'User username',
    example: 'johndoe',
    required: false,
  })
  username?: string;

  @ApiProperty({
    description: 'User email',
    example: 'john.doe@company.com',
  })
  email: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+1234567890',
    required: false,
  })
  phone?: string;

  @ApiProperty({
    description: 'User status',
    enum: UserStatus,
    example: UserStatus.active,
  })
  status: UserStatus;

  @ApiProperty({
    description: 'User creation date',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Assigned store information',
    required: false,
  })
  assignedStore?: {
    id: string;
    name: string;
  };

  @ApiProperty({
    description: 'User role information',
    required: false,
  })
  role?: {
    id: string;
    role: string;
  };

  @ApiProperty({
    description: 'UserTenant relationship ID',
    example: '507f1f77bcf86cd799439014',
  })
  userTenantId: string;
}