import { ActionEnum, SubjectEnum } from '@prisma/client';
import { Exclude } from 'class-transformer';

export class PermissionEntity {
  id: string;

  action: ActionEnum;

  subject: SubjectEnum;

  @Exclude()
  roleIds: string[];
  
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
