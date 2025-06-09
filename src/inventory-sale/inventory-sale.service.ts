import {
    BadRequestException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';
  import { TenantContext } from '../tenants/context/tenant.context';
  import { PaymentService } from '../payment/payment.service';
  import { CreateInventorySalesDto, InventoryItemDto } from './dto/create-inventory-sale.dto/create-inventory-sale.dto';
  import { PaginationQueryDto } from 'src/utils/dto/pagination.dto';
  import { PaymentType, SalesType, SalesStatus, CategoryTypes } from '@prisma/client';
  import { InventoryBatchAllocation, ProcessedInventoryItem } from './interfaces/inventory-sale/inventory-sale.interface';

@Injectable()
export class InventorySalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly paymentService: PaymentService,
  ) {}

  async createInventorySale(creatorId: string, dto: CreateInventorySalesDto) {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate sales relations
    await this.validateInventorySalesRelations(dto);

    // Validate inventory availability
    await this.validateInventoryQuantity(dto.inventoryItems);

    const processedItems: ProcessedInventoryItem[] = [];
    let totalAmount = 0;

    // Process each inventory item
    for (const item of dto.inventoryItems) {
      const processedItem = await this.processInventoryItem(item);
      processedItems.push(processedItem);
      totalAmount += processedItem.totalPrice;
    }

    // Add miscellaneous charges
    const miscTotal = dto.miscellaneousCharges
      ? Object.values(dto.miscellaneousCharges).reduce(
          (sum: number, value: number) => sum + Number(value),
          0,
        )
      : 0;

    const finalTotalAmount = totalAmount + miscTotal;

    let sale: any;
    let paymentResponse = null;

    await this.prisma.$transaction(async (prisma) => {
      // Create the main sales record
      sale = await prisma.sales.create({
        data: {
          tenantId,
          salesType: SalesType.INVENTORY,
          customerId: dto.customerId,
          totalPrice: finalTotalAmount,
          status: this.getInitialStatus(dto.paymentType),
          paymentType: dto.paymentType,
          receiptNumber: dto.receiptNumber, // For POS/CASH payments
          miscellaneousCharges: dto.miscellaneousCharges, // Now valid
              creatorId,
          category: CategoryTypes.INVENTORY,
        },
        include: {
          customer: true,
        },
      });

      // Create inventory sale items
      for (const item of processedItems) {
        await prisma.inventorySaleItem.create({
          data: {
            tenantId,
            saleId: sale.id,
            inventoryId: item.inventoryId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            batchAllocations: {
              createMany: {
                data: item.batchAllocations.map(allocation => ({
                  inventoryBatchId: allocation.batchId,
                  quantity: allocation.quantity,
                  unitPrice: allocation.unitPrice,
                  tenantId,
                })),
              },
            },
          },
        });

        // Update inventory batch quantities
        for (const allocation of item.batchAllocations) {
          await prisma.inventoryBatch.update({
            where: {
              id: allocation.batchId,
              tenantId,
            },
            data: {
              remainingQuantity: {
                decrement: allocation.quantity,
              },
            },
          });
        }
      }

      // Handle payment for CASH/POS (instant completion)
      if (dto.paymentType === PaymentType.CASH || dto.paymentType === PaymentType.POS) {
        await prisma.payment.create({
          data: {
            tenantId,
            saleId: sale.id,
            amount: finalTotalAmount,
            paymentType: dto.paymentType,
            status: 'COMPLETED', // Now valid
            transactionRef: dto.receiptNumber || `${dto.paymentType.toLowerCase()}-${sale.id}-${Date.now()}`,
          },
        });

        // Update sale status and totalPaid
        await prisma.sales.update({
          where: { id: sale.id },
          data: {
            status: SalesStatus.COMPLETED,
            totalPaid: finalTotalAmount,
          },
        });
      }
    });

    // Handle payment processing for SYSTEM payments
    if (dto.paymentType === PaymentType.SYSTEM) {
      const transactionRef = `inv-sale-${sale.id}-${Date.now()}`;

      paymentResponse = await this.paymentService.generatePaymentPayload(
        sale.id,
        finalTotalAmount,
        sale.customer.email,
        transactionRef,
      );

      // Store payment details for webhook processing
      await this.prisma.pendingPayment.create({
        data: {
          tenantId,
          saleId: sale.id,
          transactionRef,
          amount: finalTotalAmount,
          paymentType: PaymentType.SYSTEM,
          salesType: SalesType.INVENTORY,
        },
      });
    }

    return {
      sale,
      paymentResponse,
      message: this.getResponseMessage(dto.paymentType),
    };
  }

  async getAllInventorySales(query: PaginationQueryDto & { salesType?: SalesType }) {
    const tenantId = this.tenantContext.requireTenantId();
    const { page = 1, limit = 100, salesType } = query;

    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Build where clause for filtering
    const whereClause: any = { tenantId };
    if (salesType) {
      whereClause.salesType = salesType;
    }

    const totalCount = await this.prisma.sales.count({
      where: whereClause,
    });

    const sales = await this.prisma.sales.findMany({
      where: whereClause,
      include: {
        customer: true,
        inventorySaleItems: {
          include: {
            inventory: true,
            batchAllocations: {
              include: {
                inventoryBatch: true,
              },
            },
          },
        },
        // Include product sales items for unified response
        saleItems: {
          include: {
            product: true,
            devices: true,
          },
        },
        payment: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limitNumber,
    });

    return {
      sales: this.formatUnifiedSalesResponse(sales),
      total: totalCount,
      page,
      limit,
      totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
    };
  }

  async getSaleById(id: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const sale = await this.prisma.sales.findUnique({
      where: {
        id,
        tenantId,
      },
      include: {
        customer: true,
        inventorySaleItems: {
          include: {
            inventory: true,
            batchAllocations: {
              include: {
                inventoryBatch: true,
              },
            },
          },
        },
        saleItems: {
          include: {
            product: true,
            devices: true,
            SaleRecipient: true,
          },
        },
        payment: true,
        installmentAccountDetails: true,
        contract: true,
      },
    });

    if (!sale) {
      throw new NotFoundException(`Sale with ID ${id} not found`);
    }

    return this.formatSingleSaleResponse(sale);
  }

  async processPaymentWebhook(webhookData: any) {
    const { transactionRef, status, amount } = webhookData;

    // Find pending payment
    const pendingPayment = await this.prisma.pendingPayment.findFirst({
      where: {
        transactionRef,
      },
      include: {
        sale: true,
      },
    });

    if (!pendingPayment) {
      throw new NotFoundException('Payment record not found');
    }

    if (status === 'successful' && Number(amount) === pendingPayment.amount) {
      await this.prisma.$transaction(async (prisma) => {
        // Update sales status
        await prisma.sales.update({
          where: { id: pendingPayment.saleId },
          data: {
            status: SalesStatus.COMPLETED,
            totalPaid: pendingPayment.amount,
          },
        });

        // Create payment record
        await prisma.payment.create({
          data: {
            tenantId: pendingPayment.tenantId,
            saleId: pendingPayment.saleId,
            amount: pendingPayment.amount,
            transactionRef,
            paymentType: PaymentType.SYSTEM,
            status: 'COMPLETED', // Now valid
          },
        });

        // Remove pending payment
        await prisma.pendingPayment.delete({
          where: { id: pendingPayment.id },
        });
      });

      // Emit socket event for real-time updates
      // this.socketService.emitPaymentSuccess(pendingPayment.saleId, webhookData);

      return {
        success: true,
        message: 'Payment processed successfully',
        saleId: pendingPayment.saleId,
      };
    }

    return {
      success: false,
      message: 'Payment verification failed',
    };
  }

  private async processInventoryItem(item: InventoryItemDto): Promise<ProcessedInventoryItem> {
    const tenantId = this.tenantContext.requireTenantId();

    const inventory = await this.prisma.inventory.findUnique({
      where: {
        id: item.inventoryId,
        tenantId,
      },
      include: {
        batches: {
          where: {
            remainingQuantity: { gt: 0 },
            tenantId,
          },
          orderBy: { createdAt: 'asc' }, // FIFO allocation
        },
      },
    });

    if (!inventory) {
      throw new NotFoundException(`Inventory item not found`);
    }

    const { batchAllocations, totalPrice } = this.allocateFromBatches(
      inventory.batches,
      item.quantity,
    );

    return {
      inventoryId: item.inventoryId,
      quantity: item.quantity,
      unitPrice: totalPrice / item.quantity,
      totalPrice,
      batchAllocations,
    };
  }

  private allocateFromBatches(batches: any[], requiredQuantity: number) {
    const batchAllocations: InventoryBatchAllocation[] = [];
    let remainingQuantity = requiredQuantity;
    let totalPrice = 0;

    for (const batch of batches) {
      if (remainingQuantity <= 0) break;

      const quantityFromBatch = Math.min(batch.remainingQuantity, remainingQuantity);

      if (quantityFromBatch > 0) {
        const allocationPrice = batch.price * quantityFromBatch;

        batchAllocations.push({
          batchId: batch.id,
          quantity: quantityFromBatch,
          unitPrice: batch.price,
        });

        totalPrice += allocationPrice;
        remainingQuantity -= quantityFromBatch;
      }
    }

    if (remainingQuantity > 0) {
      throw new BadRequestException('Insufficient inventory quantity');
    }

    return { batchAllocations, totalPrice };
  }

  private async validateInventorySalesRelations(dto: CreateInventorySalesDto) {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate customer
    const customer = await this.prisma.customer.findUnique({
      where: {
        id: dto.customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID: ${dto.customerId} not found`);
    }

    // Validate receipt number uniqueness for POS/CASH payments
    if (dto.paymentType !== PaymentType.SYSTEM && dto.receiptNumber) {
      const existingReceipt = await this.prisma.sales.findFirst({
        where: {
          receiptNumber: dto.receiptNumber,
          tenantId,
        },
      });

      if (existingReceipt) {
        throw new BadRequestException(`Receipt number ${dto.receiptNumber} already exists`);
      }
    }
  }

  private async validateInventoryQuantity(inventoryItems: InventoryItemDto[]) {
    const tenantId = this.tenantContext.requireTenantId();

    // Check for duplicate inventory IDs
    const inventoryIds = inventoryItems.map(item => item.inventoryId);
    if (new Set(inventoryIds).size !== inventoryIds.length) {
      throw new BadRequestException('Duplicate inventory items are not allowed');
    }

    // Validate inventory availability
    for (const item of inventoryItems) {
      const inventory = await this.prisma.inventory.findUnique({
        where: {
          id: item.inventoryId,
          tenantId,
        },
        include: {
          batches: {
            where: {
              remainingQuantity: { gt: 0 },
              tenantId,
            },
          },
        },
      });

      if (!inventory) {
        throw new NotFoundException(`Inventory item ${item.inventoryId} not found`);
      }

      const totalAvailable = inventory.batches.reduce(
        (sum, batch) => sum + batch.remainingQuantity,
        0,
      );

      if (totalAvailable < item.quantity) {
        throw new BadRequestException(
          `Insufficient quantity for inventory ${inventory.name}. Available: ${totalAvailable}, Required: ${item.quantity}`,
        );
      }
    }
  }

  private getInitialStatus(paymentType: PaymentType): SalesStatus {
    switch (paymentType) {
      case PaymentType.CASH:
      case PaymentType.POS:
        return SalesStatus.COMPLETED;
      case PaymentType.SYSTEM:
        return SalesStatus.UNPAID;
      default:
        return SalesStatus.UNPAID;
    }
  }

  private getResponseMessage(paymentType: PaymentType): string {
    switch (paymentType) {
      case PaymentType.CASH:
        return 'Cash sale completed successfully';
      case PaymentType.POS:
        return 'POS sale completed successfully';
      case PaymentType.SYSTEM:
        return 'Payment account generated. Awaiting payment confirmation.';
      default:
        return 'Sale created successfully';
    }
  }

  private formatUnifiedSalesResponse(sales: any[]) {
    return sales.map(sale => ({
      id: sale.id,
      salesType: sale.salesType,
      customer: sale.customer,
      totalPrice: sale.totalPrice,
      totalPaid: sale.totalPaid,
      status: sale.status,
      paymentType: sale.paymentType,
      receiptNumber: sale.receiptNumber,
      miscellaneousCharges: sale.miscellaneousCharges,
      createdAt: sale.createdAt,
      // Unified items structure
      items: sale.salesType === SalesType.INVENTORY
        ? sale.inventorySaleItems.map(item => ({
            type: 'inventory',
            id: item.id,
            name: item.inventory.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          }))
        : sale.saleItems.map(item => ({
            type: 'product',
            id: item.id,
            name: item.product.name,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
          })),
    }));
  }

  private formatSingleSaleResponse(sale: any) {
    const baseResponse = {
      id: sale.id,
      salesType: sale.salesType,
      customer: sale.customer,
      totalPrice: sale.totalPrice,
      totalPaid: sale.totalPaid,
      status: sale.status,
      paymentType: sale.paymentType,
      receiptNumber: sale.receiptNumber,
      miscellaneousCharges: sale.miscellaneousCharges,
      createdAt: sale.createdAt,
      payment: sale.payment,
    };

    if (sale.salesType === SalesType.INVENTORY) {
      return {
        ...baseResponse,
        inventoryItems: sale.inventorySaleItems.map(item => ({
          id: item.id,
          inventory: item.inventory,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          batchAllocations: item.batchAllocations,
        })),
      };
    } else {
      return {
        ...baseResponse,
        saleItems: sale.saleItems,
        installmentAccountDetails: sale.installmentAccountDetails,
        contract: sale.contract,
      };
    }
  }
}