import { ApiProperty } from '@nestjs/swagger';
import { IsObjectId } from 'class-validator-mongo-object-id';
import { IsEmail, IsNotEmpty, IsNumber, IsString, IsUUID, MinLength } from 'class-validator';
import { PasswordRelated } from 'src/auth/customValidators/passwordRelated';
import { MESSAGES } from 'src/constants';

export class CreateTenantUserDto {
  @ApiProperty({
    example: 'john',
    required: true,
    description: 'First name of new user',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  firstname: string;

  @ApiProperty({
    example: 'doe',
    required: true,
    description: 'Last name of new user',
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
    example: '09000000000',
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
    example: '20030304',
    required: true,
    description: 'ID for payment reference',
  })
  @IsNotEmpty()
  @IsNumber()
  paymentReference: number;

  @ApiProperty({
    example: 'P@55w)rd',
    required: true,
    description: 'Password of the new user',
  })
  @IsNotEmpty()
  @PasswordRelated(['email', 'firstName', 'lastName'], {
    message: `{type: ['password', 'email', 'firstName', 'lastName'], error: 'Password must not be similar to your email, first name, or last name'}`,
  })
  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
  password: string;
}
