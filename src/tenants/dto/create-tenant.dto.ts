import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsNumber, IsDateString, IsObject } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Solar Monkey' })
  @IsString()
  companyName: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'CRM tools' })
  @IsOptional()
  @IsString()
  interest?: string;

  @ApiProperty({ example: 'Looking to try it for 30 days' })
  @IsOptional()
  @IsString()
  moreInfo?: string;

  @ApiProperty({ example: 4000 })
  @IsOptional()
  @IsNumber()
  monthlyFee?: number;

  @ApiProperty({ example: '681b5f6042025a21a4cc3c4c' })
  @IsOptional()
  @IsString()
  cardToken?: string;


  @ApiProperty({ example: '2025-05-15T16:36:29.010+00:00' })
  @IsOptional()
  @IsDateString()
  cardTokenExpirerDate?: string;

  @ApiProperty({
    example: {
      primary: '#005599',
      buttonText: '#FFFFFF',
      ascent: '#FFFFFF',
      secondary: '#000000',
    },
    description: 'Branding theme colors',
  })
  @IsOptional()
  @IsObject()
  theme?: Record<string, string>;

  @ApiProperty(
    {
      example: 'ubuxa.ubuxa.ng',
      description: 'The domain url of the tenant'
    }
  )
  @IsOptional()
  @IsString()
  domainUrl?: string;
}
