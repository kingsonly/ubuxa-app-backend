import { SetMetadata } from '@nestjs/common';

export const GetTenant = (...args: string[]) => SetMetadata('get-tenant', args);
