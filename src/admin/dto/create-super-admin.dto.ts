import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { MESSAGES } from '../../constants';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSuperAdminDto {
  @ApiProperty({
    example: 'testuser@gmail.com',
    required: true,
    description: 'Email of super user',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '09yu2408h0wnh89h20',
    required: true,
    description: 'super user key creation key',
  })
  @IsNotEmpty()
  cKey: string;

  @ApiProperty({
    example: 'new-user-password',
    required: true,
    description: 'password of super user',
  })
  @IsNotEmpty()
  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
  password: string;
}
