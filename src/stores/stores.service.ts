import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StoreType, TenantStoreType } from '@prisma/client';
import { CreateStoreDto } from './dto/create-store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly hierarchyMap: Record<StoreType, StoreType[]> = {
    [StoreType.MAIN]: [StoreType.REGIONAL],
    [StoreType.REGIONAL]: [StoreType.SUB_REGIONAL],
    [StoreType.SUB_REGIONAL]: [],
  };

  async createStore(dto: CreateStoreDto, userContext: { tenantId: string, storeId?: string }): Promise<any> {
    const { tenantId, storeId } = userContext;

    // const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // userId: string;
    // if (!user || user.role !== 'admin') {
    //   throw new ForbiddenException('Only admins can create warehouses');
    // }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.storeType === TenantStoreType.SINGLE_STORE) {
      const existingWarehouse = await this.prisma.store.findFirst({ where: { tenantId } });
      if (existingWarehouse) {
        throw new BadRequestException('Tenant with single store type already has a warehouse');
      }
    }

    let type: StoreType;
    if (!storeId) {
      type = StoreType.MAIN;
    } else {
      const parent = await this.prisma.store.findUnique({ where: { id: storeId } });
      if (!parent) {
        throw new NotFoundException('Parent warehouse not found');
      }

      const allowed = this.hierarchyMap[parent.type as StoreType];
      if (!allowed || allowed.length === 0) {
        throw new BadRequestException('This type of warehouse cannot create children');
      }

      type = allowed[0];
    }

    return this.prisma.store.create({
      data: {
        name: dto.name,
        type,
        parentId: storeId ?? undefined,
        tenantId,
      },
    });
  }

  async getStore(id: string, userContext: { tenantId: string }) {
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId: userContext.tenantId },
    });
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async listStores(userContext: { tenantId: string }) {
    return this.prisma.store.findMany({
      where: { tenantId: userContext.tenantId },
    });
  }
}
