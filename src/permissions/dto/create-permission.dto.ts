import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ActionEnum, SubjectEnum } from '@prisma/client';

export class CreatePermissionDto {
  @ApiProperty({
    description: 'The action type that defines the permission (e.g., manage, read, write, delete).',
    example: ActionEnum.manage,
    enum: ActionEnum,
  })
  @IsEnum(ActionEnum, { message: 'Invalid action type' })
  action: ActionEnum;

  @ApiProperty({
    description: 'The subject to which the action applies (e.g., User, TempToken, or all).',
    example: SubjectEnum.User,
    enum: SubjectEnum,
  })
  @IsEnum(SubjectEnum, { message: 'Invalid subject' })
  subject: SubjectEnum;
}
