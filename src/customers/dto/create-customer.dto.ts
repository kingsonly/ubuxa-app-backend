import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AddressType } from '@prisma/client';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  Length,
  IsEmail,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({
    description: 'Customer Firstname',
    example: 'James',
  })
  @IsNotEmpty()
  @IsString()
  firstname: string;

  @ApiProperty({
    description: 'Customer Lastname',
    example: 'Lewis',
  })
  @IsNotEmpty()
  @IsString()
  lastname: string;

  @ApiProperty({
    description: 'The email of the customer',
    example: 'francisalexander000@gmail.com',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'The phone number of the customer',
    maxLength: 15,
    example: '+1234567890',
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 15)
  phone: string;

  @ApiProperty({
    enum: AddressType,
    example: 'HOME',
  })
  @IsNotEmpty()
  @IsEnum(AddressType)
  addressType: AddressType;

  @ApiProperty({
    description: 'The location of the customer',
    example: 'New York, USA',
  })
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiPropertyOptional({
    description: 'The longitude of the customer',
    type: String,
    example: '',
  })
  @IsOptional()
  @IsString()
  longitude?: string;

  @ApiPropertyOptional({
    description: 'The latitude of the customer',
    type: String,
    example: '',
  })
  @IsOptional()
  @IsString()
  latitude?: string;
}
