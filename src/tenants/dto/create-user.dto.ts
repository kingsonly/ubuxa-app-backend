import { ApiProperty } from '@nestjs/swagger';
import { IsObjectId } from 'class-validator-mongo-object-id';
import { IsEmail, IsNotEmpty, IsNumber, IsString, IsUUID, MinLength } from 'class-validator';
import { PasswordRelated } from 'src/auth/customValidators/passwordRelated';
import { MESSAGES } from 'src/constants';

export class CreateUserDto {
  @ApiProperty({
    example: 'john',
    required: true,
    description: 'Firstname of new user',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  firstname: string;

  @ApiProperty({
    example: 'okor@gmail',
    required: true,
    description: 'Lastname of new user',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  lastname: string;

  @ApiProperty({
    example: 'francisalexander000@gmail.com',
    required: true,
    description: 'Email of new user. Must be unique',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '09062736182',
    required: true,
    description: 'Phone number of new user',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(5)
  phone: string;

  @ApiProperty({
    example: 'Abuja',
    required: true,
    description: 'Location of user',
  })
  @IsNotEmpty()
  @IsString()
  location: string;
  @ApiProperty({
    example: 'Abuja',
    required: true,
    description: 'Location of user',
  })

  @IsNotEmpty()
  @IsNumber()
  paymentReference: number;

  @IsNotEmpty()
  @PasswordRelated(['email', 'firstName', 'lastName'], {
    message: `{type: ['password', 'email', 'firstName', 'lastName'], error: 'Password must not be similar to your email, first name, or last name'}`,
  })
  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
  password: string;
}
