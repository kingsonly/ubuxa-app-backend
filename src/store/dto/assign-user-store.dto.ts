import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignUserStoreDto {
  @ApiProperty({
    description: 'User ID to assign to the store',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'Store ID to assign the user to',
    example: '507f1f77bcf86cd799439012',
  })
  @IsString()
  storeId: string;
}