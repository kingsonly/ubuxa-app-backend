import { IsEmail, IsString, IsOptional } from 'class-validator';

export class CreateTenantDto {
  @IsEmail()
  email: string;

  @IsString()
  companyName: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  interest?: string;

  @IsOptional()
  @IsString()
  moreInfo?: string;
}
