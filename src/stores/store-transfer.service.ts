import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransferStatus, TransferType, RequestStatus, StoreType } from '@prisma/client';
import { 
  CreateStoreTransferDto, 
  CreateStoreRequestDto, 
  ApproveStoreRequestDto,
  RejectStoreRequestDto,
  TransferFilterDto 
} from './dto/store-transfer.dto';

@Injectable()
export class StoreTransferService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateTransferNumber(): Promise<string> {
    const timestamp = Date.now();
    return `TRF-${timestamp}`;
  }

  private async generateRequestNumber(): Promise<string> {
    const timestamp = Date.now();
    return `REQ-${timestamp}`;
  }

  private async validateStoreHierarchy(fromStoreId: string, toStoreId: string, tenantId: string): Promise<{ canTransfer: boolean, reason?: string }> {
    const [fromStore, toStore] = await Promise.all([
      this.prisma.store.findFirst({
        where: { id: fromStoreId, tenantId },
        include: { parent: true, children: true }
      }),
      this.prisma.store.findFirst({
        where: { id: toStoreId, tenantId }
      })
    ]);

    if (!fromStore || !toStore) {
      return { canTransfer: false, reason: 'Store not found' };
    }

    // Main store can transfer to any store
    if (fromStore.type === StoreType.MAIN) {
      return { canTransfer: true };
    }

    // Regional stores can transfer to sub-regional stores in their hierarchy
    if (fromStore.type === StoreType.REGIONAL) {
      const isChildStore = fromStore.children.some(child => child.id === toStoreId);
      if (isChildStore) {
        return { canTransfer: true };
      }
      return { canTransfer: false, reason: 'Regional stores can only transfer to their sub-regional stores' };
    }

    // Sub-regional stores can only transfer within their region (to sibling stores)
    if (fromStore.type === StoreType.SUB_REGIONAL) {
      if (fromStore.parentId === toStore.parentId) {
        return { canTransfer: true };
      }
      return { canTransfer: false, reason: 'Sub-regional stores can only transfer to stores in the same region' };
    }

    return { canTransfer: false, reason: 'Invalid store hierarchy' };
  }

  async createTransfer(
    fromStoreId: string,
    dto: CreateStoreTransferDto,
    userContext: { tenantId: string, userId: string }
  ) {
    const { tenantId, userId } = userContext;

    // Validate hierarchy
    const hierarchyCheck = await this.validateStoreHierarchy(fromStoreId, dto.toStoreId, tenantId);
    if (!hierarchyCheck.canTransfer) {
      throw new ForbiddenException(hierarchyCheck.reason);
    }

    // Check if source store has sufficient inventory
    const sourceStoreInventory = await this.prisma.storeInventory.findFirst({
      where: {
        storeId: fromStoreId,
        inventoryId: dto.inventoryId,
        tenantId
      }
    });

    if (!sourceStoreInventory || sourceStoreInventory.quantity < dto.quantity) {
      throw new BadRequestException('Insufficient inventory in source store');
    }

    // Check store configuration for approval requirements
    const fromStoreConfig = await this.prisma.storeConfiguration.findFirst({
      where: { storeId: fromStoreId }
    });

    const requiresApproval = fromStoreConfig?.requireApprovalFor && 
      dto.quantity >= fromStoreConfig.requireApprovalFor;

    const transferNumber = await this.generateTransferNumber();

    // Create transfer
    const transfer = await this.prisma.storeTransfer.create({
      data: {
        transferNumber,
        fromStoreId,
        toStoreId: dto.toStoreId,
        inventoryId: dto.inventoryId,
        quantity: dto.quantity,
        transferType: dto.transferType || TransferType.DISTRIBUTION,
        status: requiresApproval ? TransferStatus.PENDING : TransferStatus.APPROVED,
        initiatedBy: userId,
        approvedBy: requiresApproval ? null : userId,
        notes: dto.notes,
        tenantId,
        ...(requiresApproval ? {} : { approvedAt: new Date() })
      },
      include: {
        fromStore: true,
        toStore: true,
        inventory: true,
        initiator: { select: { firstname: true, lastname: true, email: true } }
      }
    });

    // If auto-approved, process the transfer immediately
    if (!requiresApproval) {
      await this.processApprovedTransfer(transfer.id, tenantId);
    }

    return transfer;
  }

  async createRequest(
    fromStoreId: string,
    dto: CreateStoreRequestDto,
    userContext: { tenantId: string, userId: string }
  ) {
    const { tenantId, userId } = userContext;

    // Validate that requesting store can request from target store
    const [fromStore, toStore] = await Promise.all([
      this.prisma.store.findFirst({
        where: { id: fromStoreId, tenantId },
        include: { parent: true }
      }),
      this.prisma.store.findFirst({
        where: { id: dto.toStoreId, tenantId }
      })
    ]);

    if (!fromStore || !toStore) {
      throw new NotFoundException('Store not found');
    }

    // Stores can request from parent stores or main store
    const canRequest = 
      fromStore.parentId === dto.toStoreId || // Request from direct parent
      toStore.type === StoreType.MAIN; // Request from main store

    if (!canRequest) {
      throw new ForbiddenException('Can only request from parent stores or main store');
    }

    const requestNumber = await this.generateRequestNumber();

    return this.prisma.storeRequest.create({
      data: {
        requestNumber,
        fromStoreId,
        toStoreId: dto.toStoreId,
        inventoryId: dto.inventoryId,
        requestedQuantity: dto.requestedQuantity,
        priority: dto.priority,
        requestedBy: userId,
        justification: dto.justification,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        tenantId,
      },
      include: {
        fromStore: true,
        toStore: true,
        inventory: true,
        requester: { select: { firstname: true, lastname: true, email: true } }
      }
    });
  }

  async approveRequest(
    requestId: string,
    dto: ApproveStoreRequestDto,
    userContext: { tenantId: string, userId: string }
  ) {
    const { tenantId, userId } = userContext;

    const request = await this.prisma.storeRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { fromStore: true, toStore: true, inventory: true }
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    // Check if approving store has sufficient inventory
    const toStoreInventory = await this.prisma.storeInventory.findFirst({
      where: {
        storeId: request.toStoreId,
        inventoryId: request.inventoryId,
        tenantId
      }
    });

    if (!toStoreInventory || toStoreInventory.quantity < dto.approvedQuantity) {
      throw new BadRequestException('Insufficient inventory to fulfill request');
    }

    // Update request status
    const updatedRequest = await this.prisma.storeRequest.update({
      where: { id: requestId },
      data: {
        status: dto.approvedQuantity === request.requestedQuantity ? 
          RequestStatus.APPROVED : RequestStatus.PARTIALLY_APPROVED,
        approvedQuantity: dto.approvedQuantity,
        reviewedBy: userId,
        reviewedAt: new Date(),
        notes: dto.notes
      }
    });

    // Create corresponding transfer
    const transferNumber = await this.generateTransferNumber();
    const transfer = await this.prisma.storeTransfer.create({
      data: {
        transferNumber,
        fromStoreId: request.toStoreId,
        toStoreId: request.fromStoreId,
        inventoryId: request.inventoryId,
        quantity: dto.approvedQuantity,
        transferType: TransferType.REQUEST_FULFILLMENT,
        status: TransferStatus.APPROVED,
        requestId: requestId,
        initiatedBy: userId,
        approvedBy: userId,
        approvedAt: new Date(),
        notes: `Fulfilling request ${request.requestNumber}`,
        tenantId
      }
    });

    // Process the transfer
    await this.processApprovedTransfer(transfer.id, tenantId);

    return { request: updatedRequest, transfer };
  }

  async rejectRequest(
    requestId: string,
    dto: RejectStoreRequestDto,
    userContext: { tenantId: string, userId: string }
  ) {
    const { tenantId, userId } = userContext;

    const request = await this.prisma.storeRequest.findFirst({
      where: { id: requestId, tenantId }
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    return this.prisma.storeRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.REJECTED,
        reviewedBy: userId,
        reviewedAt: new Date(),
        rejectionReason: dto.rejectionReason
      }
    });
  }

  private async processApprovedTransfer(transferId: string, tenantId: string) {
    const transfer = await this.prisma.storeTransfer.findFirst({
      where: { id: transferId, tenantId }
    });

    if (!transfer || transfer.status !== TransferStatus.APPROVED) {
      throw new BadRequestException('Transfer not found or not approved');
    }

    // Use transaction to ensure data consistency
    await this.prisma.$transaction(async (tx) => {
      // Decrease quantity in source store
      await tx.storeInventory.updateMany({
        where: {
          storeId: transfer.fromStoreId,
          inventoryId: transfer.inventoryId
        },
        data: {
          quantity: { decrement: transfer.quantity }
        }
      });

      // Increase quantity in destination store (or create if doesn't exist)
      const destInventory = await tx.storeInventory.findFirst({
        where: {
          storeId: transfer.toStoreId,
          inventoryId: transfer.inventoryId
        }
      });

      if (destInventory) {
        await tx.storeInventory.update({
          where: { id: destInventory.id },
          data: {
            quantity: { increment: transfer.quantity }
          }
        });
      } else {
        // Find root source store
        const mainStore = await tx.store.findFirst({
          where: { tenantId, type: StoreType.MAIN }
        });

        await tx.storeInventory.create({
          data: {
            storeId: transfer.toStoreId,
            inventoryId: transfer.inventoryId,
            quantity: transfer.quantity,
            rootSourceStoreId: mainStore?.id || transfer.fromStoreId,
            tenantId
          }
        });
      }

      // Update transfer status
      await tx.storeTransfer.update({
        where: { id: transferId },
        data: {
          status: TransferStatus.COMPLETED,
          completedAt: new Date()
        }
      });

      // Update request status if this was request fulfillment
      if (transfer.requestId) {
        await tx.storeRequest.update({
          where: { id: transfer.requestId },
          data: { status: RequestStatus.FULFILLED }
        });
      }
    });
  }

  async getTransfers(
    storeId: string,
    filters: TransferFilterDto,
    userContext: { tenantId: string }
  ) {
    const { tenantId } = userContext;
    const { page = 1, limit = 20, status, transferType } = filters;

    const skip = (page - 1) * limit;

    let whereClause: any = {
      tenantId,
      OR: [
        { fromStoreId: storeId },
        { toStoreId: storeId }
      ]
    };

    if (status) whereClause.status = status;
    if (transferType) whereClause.transferType = transferType;

    const [transfers, total] = await Promise.all([
      this.prisma.storeTransfer.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          fromStore: true,
          toStore: true,
          inventory: true,
          initiator: { select: { firstname: true, lastname: true } },
          approver: { select: { firstname: true, lastname: true } },
          request: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.storeTransfer.count({ where: whereClause })
    ]);

    return {
      transfers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getRequests(
    storeId: string,
    filters: { page?: number; limit?: number; status?: RequestStatus },
    userContext: { tenantId: string }
  ) {
    const { tenantId } = userContext;
    const { page = 1, limit = 20, status } = filters;

    const skip = (page - 1) * limit;

    let whereClause: any = {
      tenantId,
      OR: [
        { fromStoreId: storeId }, // Requests made by this store
        { toStoreId: storeId }    // Requests made to this store
      ]
    };

    if (status) whereClause.status = status;

    const [requests, total] = await Promise.all([
      this.prisma.storeRequest.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          fromStore: true,
          toStore: true,
          inventory: true,
          requester: { select: { firstname: true, lastname: true } },
          reviewer: { select: { firstname: true, lastname: true } },
          transfers: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.storeRequest.count({ where: whereClause })
    ]);

    return {
      requests,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}