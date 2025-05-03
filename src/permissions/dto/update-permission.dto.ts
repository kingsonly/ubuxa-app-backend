import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ActionEnum, SubjectEnum } from '@prisma/client';

export class UpdatePermissionDto {
  @ApiProperty({
    description: 'The updated action type that defines the permission (e.g., manage, read, write, delete).',
    example: ActionEnum.manage,
    enum: ActionEnum,
    required: false,
  })
  @IsEnum(ActionEnum, { message: 'Invalid action type' })
  action: ActionEnum;

  @ApiProperty({
    description: 'The updated subject to which the action applies (e.g., User, TempToken, or all).',
    example: SubjectEnum.Customers,
    enum: SubjectEnum,
    required: false,
  })
  @IsEnum(SubjectEnum, { message: 'Invalid subject' })
  subject: SubjectEnum;
}
