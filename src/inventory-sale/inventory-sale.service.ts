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
import { SalesGateway } from '../websocket/websocket.gateway';

  @Injectable()
  export class InventorySalesService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly tenantContext: TenantContext,
      private readonly paymentService: PaymentService,
      private readonly webSocketGateway: SalesGateway,
    ) {}

    async createInventorySale(creatorId: string, dto: CreateInventorySalesDto) {
      const tenantId = this.tenantContext.requireTenantId();

      // Validate and pre-fetch all required data in a single transaction
      const {  inventoryData } = await this.validateAndFetchData(dto, tenantId);

      // Process inventory items with batch allocations
      const { processedItems, totalAmount } = await this.processInventoryItems(dto.inventoryItems, inventoryData);

      // Calculate final total with miscellaneous charges
      const miscTotal = dto.miscellaneousCharges
        ? Object.values(dto.miscellaneousCharges).reduce((sum, value) => sum + Number(value), 0)
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
            receiptNumber: dto.receiptNumber,
            miscellaneousCharges: dto.miscellaneousCharges,
            creatorId,
            category: CategoryTypes.INVENTORY,
          },
          include: { customer: true },
        });

        this.webSocketGateway.emitEvent('inventory_sale_created', {
          saleId: sale.id,
          customerId: sale.customerId,
          totalAmount: finalTotalAmount,
          status: sale.status,
        });

        // Create inventory sale items and update batches in a single operation
        await this.createSaleItemsAndUpdateBatches(prisma, sale.id, processedItems, tenantId);

        // Handle immediate payments (CASH/POS)
        if (dto.paymentType === PaymentType.CASH || dto.paymentType === PaymentType.POS) {
          await this.handleImmediatePayment(prisma, sale.id, finalTotalAmount, dto.paymentType, dto.receiptNumber, tenantId);
        }
      });

      // Handle SYSTEM payments (async)
      if (dto.paymentType === PaymentType.SYSTEM) {
        this.webSocketGateway.emitEvent('payment_pending', {
          saleId: sale.id,
          amount: finalTotalAmount,
          paymentUrl: paymentResponse?.paymentUrl,
        });
        paymentResponse = await this.handleSystemPayment(sale, finalTotalAmount, tenantId);
      }

      return {
        sale,
        paymentResponse,
        message: this.getResponseMessage(dto.paymentType),
      };
    }

    private async validateAndFetchData(dto: CreateInventorySalesDto, tenantId: string) {
      // Fetch all required data in parallel
      const [customer, inventoryData, existingReceipt] = await Promise.all([
        this.prisma.customer.findUnique({
          where: { id: dto.customerId, tenantId },
        }),
        this.fetchInventoryData(dto.inventoryItems, tenantId),
        dto.paymentType !== PaymentType.SYSTEM && dto.receiptNumber
          ? this.prisma.sales.findFirst({
              where: { receiptNumber: dto.receiptNumber, tenantId },
            })
          : Promise.resolve(null),
      ]);

      // Validate results
      if (!customer) throw new NotFoundException(`Customer with ID: ${dto.customerId} not found`);
      if (existingReceipt) throw new BadRequestException(`Receipt number ${dto.receiptNumber} already exists`);

      return { customer, inventoryData, existingReceipt };
    }

    private async fetchInventoryData(items: InventoryItemDto[], tenantId: string) {
      const inventoryIds = items.map(item => item.inventoryId);

      // Fetch all inventory with batches in one query
      const inventories = await this.prisma.inventory.findMany({
        where: {
          id: { in: inventoryIds },
          tenantId,
        },
        include: {
          batches: {
            where: {
              remainingQuantity: { gt: 0 },
              tenantId,
            },
            orderBy: { createdAt: 'asc' }, // FIFO
          },
        },
      });

      // Check if all inventory items were found
      if (inventories.length !== inventoryIds.length) {
        const foundIds = new Set(inventories.map(i => i.id));
        const missingIds = inventoryIds.filter(id => !foundIds.has(id));
        throw new NotFoundException(`Inventory items not found: ${missingIds.join(', ')}`);
      }

      // Create a map for quick access
      return new Map(inventories.map(inv => [inv.id, inv]));
    }

    private async processInventoryItems(items: InventoryItemDto[], inventoryData: Map<string, any>) {
      const processedItems: ProcessedInventoryItem[] = [];
      let totalAmount = 0;

      for (const item of items) {
        const inventory = inventoryData.get(item.inventoryId);
        if (!inventory) continue; // Shouldn't happen due to prior validation

        const { batchAllocations, totalPrice } = this.allocateFromBatches(
          inventory.batches,
          item.quantity
        );

        const processedItem: ProcessedInventoryItem = {
          inventoryId: item.inventoryId,
          quantity: item.quantity,
          unitPrice: totalPrice / item.quantity,
          totalPrice,
          batchAllocations,
          // Add device support if needed
          devices: item.devices || [],
        };

        processedItems.push(processedItem);
        totalAmount += totalPrice;
      }

      return { processedItems, totalAmount };
    }

    private async createSaleItemsAndUpdateBatches(
      prisma: any,
      saleId: string,
      items: ProcessedInventoryItem[],
      tenantId: string
    ) {
      // Prepare all operations in parallel
      const operations = items.flatMap(item => {
        const itemOperations = [
          prisma.inventorySaleItem.create({
            data: {
              tenantId,
              saleId,
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
          }),
        ];

        // Add device connections if devices are present
        if (item.devices && item.devices.length > 0) {
          itemOperations.push(
            prisma.inventorySaleItem.update({
              where: { id: item.inventoryId }, // This needs adjustment based on your actual schema
              data: {
                devices: {
                  connect: item.devices.map(deviceId => ({ id: deviceId })),
                },
              },
            })
          );
        }

        // Add batch updates
        itemOperations.push(
          ...item.batchAllocations.map(allocation =>
            prisma.inventoryBatch.update({
              where: { id: allocation.batchId, tenantId },
              data: { remainingQuantity: { decrement: allocation.quantity } },
            })
          )
        );

        return itemOperations;
      });

      // Execute all operations
      await Promise.all(operations);
    }

    private async handleImmediatePayment(
      prisma: any,
      saleId: string,
      amount: number,
      paymentType: PaymentType,
      receiptNumber: string,
      tenantId: string
    ) {
      await prisma.payment.create({
        data: {
          tenantId,
          saleId,
          amount,
          paymentType,
          status: 'COMPLETED',
          transactionRef: receiptNumber || `${paymentType.toLowerCase()}-${saleId}-${Date.now()}`,
        },
      });

      await prisma.sales.update({
        where: { id: saleId },
        data: {
          status: SalesStatus.COMPLETED,
          totalPaid: amount,
        },
      });
    }

    private async handleSystemPayment(sale: any, amount: number, tenantId: string) {
      const transactionRef = `inv-sale-${sale.id}-${Date.now()}`;
      const paymentResponse = await this.paymentService.generatePaymentPayload(
        sale.id,
        amount,
        sale.customer.email,
        transactionRef,
      );

      await this.prisma.pendingPayment.create({
        data: {
          tenantId,
          saleId: sale.id,
          transactionRef,
          amount,
          paymentType: PaymentType.SYSTEM,
          salesType: SalesType.INVENTORY,
        },
      });

      return paymentResponse;
    }
    async getAllInventorySales(
      query: PaginationQueryDto & {
        salesType?: SalesType;
        status?: SalesStatus;
        startDate?: Date;
        endDate?: Date;
      }
    ) {
      const tenantId = this.tenantContext.requireTenantId();
      const { page = 1, limit = 100, status, startDate, endDate } = query;

      // Build optimized where clause
      const where: any = { tenantId, salesType: SalesType.INVENTORY };
      if (status) where.status = status;
      if (startDate || endDate) {
        where.createdAt = {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate && { lte: new Date(endDate) }),
        };
      }

      // Single count query with same filters
      const [totalCount, sales] = await Promise.all([
        this.prisma.sales.count({ where }),
        this.prisma.sales.findMany({
          where,
          include: {
            customer: { select: { id: true, firstname: true, email: true } }, // Only essential fields
            inventorySaleItems: {
              include: {
                inventory: { select: { id: true, name: true } },
                batchAllocations: {
                  include: {
                    inventoryBatch: { select: { id: true, batchNumber: true } },
                  },
                },
              },
            },
            payment: { select: { status: true, amount: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit),
        }),
      ]);

      return {
        sales: this.formatSalesResponse(sales),
        pagination: {
          total: totalCount,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(totalCount / Number(limit)),
        },
      };
    }

    async getSaleById(id: string) {
      const tenantId = this.tenantContext.requireTenantId();

      // Single query with all necessary relations
      const sale = await this.prisma.sales.findUnique({
        where: { id, tenantId },
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
              // devices: true, // Include connected devices
            },
          },
          payment: true,
          // creator: { select: { id: true, name: true } },
        },
      });

      if (!sale) {
        throw new NotFoundException(`Inventory sale with ID ${id} not found`);
      }

      return this.formatDetailedSale(sale);
    }


    private allocateFromBatches(
      batches: any[],
      requiredQuantity: number
    ): { batchAllocations: InventoryBatchAllocation[]; totalPrice: number } {
      const allocations: InventoryBatchAllocation[] = [];
      let remainingQty = requiredQuantity;
      let totalPrice = 0;

      // FIFO allocation
      for (const batch of batches) {
        if (remainingQty <= 0) break;

        const allocatedQty = Math.min(batch.remainingQuantity, remainingQty);
        if (allocatedQty <= 0) continue;

        const allocationPrice = batch.price * allocatedQty;
        allocations.push({
          batchId: batch.id,
          quantity: allocatedQty,
          unitPrice: batch.price,
        });

        totalPrice += allocationPrice;
        remainingQty -= allocatedQty;
      }

      if (remainingQty > 0) {
        throw new BadRequestException(
          `Insufficient inventory quantity. Remaining: ${remainingQty}`
        );
      }

      return { batchAllocations: allocations, totalPrice };
    }

    private formatSalesResponse(sales: any[]) {
      return sales.map(sale => ({
        id: sale.id,
        customer: this.formatCustomer(sale.customer),
        totalPrice: sale.totalPrice,
        status: sale.status,
        paymentStatus: sale.payment?.[0]?.status,
        createdAt: sale.createdAt,
        items: sale.inventorySaleItems.map(item => ({
          id: item.id,
          inventory: { id: item.inventory.id, name: item.inventory.name },
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          batches: item.batchAllocations.map(b => ({
            batchId: b.inventoryBatch.id,
            batchNumber: b.inventoryBatch.batchNumber,
            quantity: b.quantity,
          })),
          devices: item.devices?.map(d => ({ id: d.id, serialNumber: d.serialNumber })) || [],
        })),
      }));
    }

    private formatDetailedSale(sale: any) {
      return {
        id: sale.id,
        customer: this.formatCustomer(sale.customer),
        status: sale.status,
        paymentType: sale.paymentType,
        totalPrice: sale.totalPrice,
        totalPaid: sale.totalPaid,
        createdAt: sale.createdAt,
        creator: sale.creator,
        items: sale.inventorySaleItems.map(item => ({
          id: item.id,
          inventory: {
            id: item.inventory.id,
            name: item.inventory.name,
            description: item.inventory.description,
          },
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          batches: item.batchAllocations.map(b => ({
            id: b.id,
            batchId: b.inventoryBatch.id,
            batchNumber: b.inventoryBatch.batchNumber,
            quantity: b.quantity,
            unitPrice: b.unitPrice,
          })),
          devices: item.devices?.map(d => ({
            id: d.id,
            serialNumber: d.serialNumber,
            model: d.model,
          })) || [],
        })),
        payment: sale.payment,
        receiptNumber: sale.receiptNumber,
        miscellaneousCharges: sale.miscellaneousCharges,
      };
    }

    private formatCustomer(customer: any) {
      if (!customer) return null;
      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      };
    }

    private getInitialStatus(paymentType: PaymentType): SalesStatus {
      const statusMap = {
        [PaymentType.CASH]: SalesStatus.COMPLETED,
        [PaymentType.POS]: SalesStatus.COMPLETED,
        [PaymentType.SYSTEM]: SalesStatus.UNPAID,
      };
      return statusMap[paymentType] || SalesStatus.COMPLETED;
    }

    private getResponseMessage(paymentType: PaymentType): string {
      const messages = {
        [PaymentType.CASH]: 'Cash sale completed successfully',
        [PaymentType.POS]: 'POS transaction completed',
        [PaymentType.SYSTEM]: 'Awaiting payment confirmation',
      };
      return messages[paymentType] || 'Sale processed successfully';
    }
  }