import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional } from 'class-validator';

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
}
