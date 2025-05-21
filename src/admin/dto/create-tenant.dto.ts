import { IsEmail, IsString, IsOptional, IsUrl, IsObject, IsNotEmpty } from 'class-validator';

export class CreateTenantDto {
  @IsEmail()
    email: string;

    @IsNotEmpty()
    cKey: string;

  @IsString()
  companyName: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  domain?: string;

  @IsUrl()
  @IsOptional()
  logoUrl?: string;

  @IsUrl()
  @IsOptional()
  faviconUrl?: string;

  @IsObject()
  @IsOptional()
  theme?: Record<string, any>;

  @IsString()
  @IsOptional()
  interest?: string;

  @IsString()
  @IsOptional()
  moreInfo?: string;
}