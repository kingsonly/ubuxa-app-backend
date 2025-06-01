import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsNumber, IsDateString, IsObject } from 'class-validator';
import { PaymentProvider } from '@prisma/client';
import { Transform } from 'class-transformer';
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
  @Transform(({ value }) => {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (err) {
      return value;
    }
  })
  theme?: Record<string, any>;
  @ApiProperty(
    {
      example: 'ubuxa.ubuxa.ng',
      description: 'The domain url of the tenant'
    }
  )
  @IsOptional()
  @IsString()
  domainUrl?: string;


  @ApiProperty(
    {
      example: 'FLUTTERWAVE',
      description: 'The payment provider of the tenant'
    }
  )
  @IsOptional()
  @IsString()
  paymentProvider?: PaymentProvider;

  @ApiProperty(
    {
      example: 'FL-test004i4jrjgnng',
      description: 'The provider PublicKey of the tenant'
    }
  )
  @IsOptional()
  @IsString()
  providerPublicKey?: string;

  @ApiProperty(
    {
      example: 'FL-test004i4jrjgnng',
      description: 'The provider PrivateKey of the tenant'
    }
  )
  @IsOptional()
  @IsString()
  providerPrivateKey?: string;

  @ApiProperty(
    {
      example: 'wh-303049958958',
      description: 'The webhook Secret of the tenant'
    }
  )
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiProperty(
    {
      description: 'logo url of the tenant'
    }
  )
  @IsOptional()
  @IsString()
  logoUrl?: string;
}
