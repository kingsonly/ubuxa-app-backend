import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PasswordRelated } from '../customValidators/passwordRelated';
import { MESSAGES } from '../../constants';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSuperUserDto {
  @ApiProperty({
    example: 'john',
    required: true,
    description: 'Firstname of super user',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  firstname: string;

  @ApiProperty({
    example: 'john',
    required: true,
    description: 'Lastname of super user',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  lastname: string;

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
  @PasswordRelated(['email', 'firstname', 'lastname'], {
    message: `{type: ['email', 'firstname', 'lastname'], error: 'Password must not be similar to your email, first name, or last name'}`,
  })
  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
  password: string;
}
