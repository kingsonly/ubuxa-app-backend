import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { MESSAGES } from '../../constants';
import { PasswordMatch } from '../customValidators/passwordMatches';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'old-password',
    required: true,
    description: 'old password of new user',
  })
  @IsNotEmpty()
  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
  oldPassword: string;

  @ApiProperty({
    example: 'new-password',
    required: true,
    description: 'new password of new user',
  })
  @IsNotEmpty()
  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
  @PasswordMatch('oldPassword', 'notMatch')
  password: string;

  @ApiProperty({
    example: 'new-password-confirmation',
    required: true,
    description: 'password confirmation of user',
  })
  @IsString()
  @IsNotEmpty()
  @PasswordMatch('password')
  confirmPassword: string;
}
