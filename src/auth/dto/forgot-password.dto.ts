import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDTO {
  @ApiProperty({
    example: 'francisalexander000@gmail.com',
    required: true,
    description: 'Email of new user. Must be unique',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
