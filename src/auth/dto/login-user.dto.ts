import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginUserDTO {
  @ApiProperty({
    example: 'francisalexander000@gmail.com',
    required: true,
    description: 'Email of user.',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '12345678',
    required: true,
    description: 'Password of user.',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    example: '0304jnfnjri4jrnfn',
    required: false,
    description: 'Users TenantID',
  })
  @IsString()
  @IsOptional()
  tenantId?: string;
}

