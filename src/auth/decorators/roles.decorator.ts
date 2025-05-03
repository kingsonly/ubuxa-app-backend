import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

export interface RolesArgs {
  roles?: string[];
  permissions: string[];
}

export const RolesAndPermissions = (rolesArgs: RolesArgs) =>
  SetMetadata(ROLES_KEY, rolesArgs);
