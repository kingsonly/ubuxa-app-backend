import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubCategoryDto {
  @ApiProperty({
    description: 'The name of the sub-category',
    example: 'Battery Charger',
  })
  @IsNotEmpty()
  @IsString()
  name: string;
}

export class CreateCategoryDto {
  @ApiProperty({
    description: 'The name of the category',
    example: 'Electronics',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'The Id of the parent category to be a sub category of',
    example: '',
  })
  @IsOptional()
  @IsString()
  parentId: string;

  @ApiProperty({
    description:
      'An optional array of sub-categories associated with the category',
    type: [CreateSubCategoryDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubCategoryDto)
  subCategories?: CreateSubCategoryDto[];
}

export class CreateCategoryArrayDto {
  @ApiProperty({
    description:
      'An array of categories to be created, or a single category object',
    type: [CreateCategoryDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  @Transform(({ value }) => (Array.isArray(value) ? value : [value])) // Ensures single objects are treated as arrays
  categories: CreateCategoryDto[];
}
