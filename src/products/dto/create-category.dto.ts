import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateProductCategoryDto {
  @ApiProperty({ description: 'The name of the category' }) 
  @IsNotEmpty()
  @IsString()
  name: string;
}