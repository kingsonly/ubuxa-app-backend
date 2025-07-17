import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { Express } from 'express';

export class UploadContractSignaturesDto {
  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  @Type(() => Object)
  owner?: Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  @Type(() => Object)
  nextOfKin?: Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'binary', required: false })
  @IsOptional()
  @Type(() => Object)
  guarantor?: Express.Multer.File;
}
