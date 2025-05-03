import { IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignUserToRoleDto {
  @ApiProperty({
    description: 'The ID of the role to assign to the user. Must be a valid MongoDB ObjectId.',
    example: '60d0fe4f5311236168a109ca',
  })
  @IsMongoId()
  roleId?: string;
}
