import { IsString, IsBoolean, IsOptional, IsArray, IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRoleDto {
  @ApiProperty({
    description: 'The updated name of the role.',
    example: 'Manager',
    required: false,
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiProperty({
    description: 'Indicates if the role is active or not.',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'An array of updated permission IDs for the role. Must be valid MongoDB ObjectIds.',
    example: ['60d0fe4f5311236168a109ca', '60d0fe4f5311236168a109cc'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  permissionIds?: string[];
}
