import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SelectStoreDto {
  @ApiProperty({
    description: 'Store ID to select',
    example: '507f1f77bcf86cd799439011'
  })
  @IsString()
  storeId: string;
}