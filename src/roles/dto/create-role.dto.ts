import { IsString, IsBoolean, IsOptional, IsArray, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({
    description: 'The name of the role.',
    example: 'Admin',
  })
  @IsString()
  role: string;

  @ApiProperty({
    description: 'Indicates if the role is active or not.',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'An array of permission IDs to assign to the role. Must be valid MongoDB ObjectIds.',
    example: ['60d0fe4f5311236168a109ca', '60d0fe4f5311236168a109cb'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  permissionIds?: string[];
}
