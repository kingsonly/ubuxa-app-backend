import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { MESSAGES } from '../../constants';
import { PasswordMatch } from '../customValidators/passwordMatches';
import { IsObjectId } from 'class-validator-mongo-object-id';

export class CreateUserPasswordDto {
  @ApiProperty({
    example: 'new-password',
    required: true,
    description: 'password of new user',
  })
  @IsNotEmpty()
  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
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

export class CreateUserPasswordParamsDto {
  @IsNotEmpty()
  @IsString()
  @IsObjectId({
    message: 'Invalid User Id',
  })
  userid: string;

  @IsNotEmpty()
  @IsString()
  token: string;
}
