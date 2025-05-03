import { Type } from 'class-transformer';
import { PermissionEntity } from '../../permissions/entity/permissions.entity';
import { UserEntity } from '../../users/entity/user.entity';

export class RolesEntity {
  id: string;

  role: string;

  @Type(() => PermissionEntity)
  permissions: PermissionEntity[];

  @Type(() => UserEntity)
  creator?: UserEntity;

  createdAt: Date;

  updatedAt: Date;
}
