
import { IsEmail, IsString, IsOptional, IsNotEmpty, MinLength } from 'class-validator';
import { MESSAGES } from 'src/constants';

export class CreateTenantAdminDto {
  @IsEmail()
  email: string;

  @MinLength(8, { message: MESSAGES.PASSWORD_TOO_WEAK })
  password: string;

  @IsString()
  firstname: string;

  @IsString()
  lastname: string;

  @IsString()
  phone: string;

  @IsNotEmpty()
  cKey: string;

  @IsString()
  @IsOptional()
  location?: string;
}