import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'The first name of the user',
    type: String,
    maxLength: 50,
    example: 'John',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  firstname?: string;

  @ApiPropertyOptional({
    description: 'The last name of the user',
    type: String,
    maxLength: 50,
    example: 'Doe',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  lastname?: string;

  @ApiPropertyOptional({
    description: 'The username of the user',
    type: String,
    maxLength: 50,
    example: 'johndoe',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  username?: string;

  @ApiPropertyOptional({
    description: 'The email of the user',
    type: String,
    example: 'francisalexander000@gmail.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'The phone number of the user',
    type: String,
    maxLength: 15,
    example: '+1234567890',
  })
  @IsOptional()
  @IsString()
  @Length(1, 15)
  phone?: string;

  @ApiPropertyOptional({
    description: 'The location of the user',
    type: String,
    maxLength: 100,
    example: 'New York, USA',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  location?: string;
}
