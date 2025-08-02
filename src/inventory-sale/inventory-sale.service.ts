import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenants/context/tenant.context';
import { StoreContext } from '../stores/context/store.context';
import { StoresService } from '../stores/stores.service';
import { PaymentService } from '../payment/payment.service';
import { CreateInventorySalesDto, InventoryItemDto } from './dto/create-inventory-sale.dto/create-inventory-sale.dto';
import { PaginationQueryDto } from 'src/utils/dto/pagination.dto';
import { PaymentType, SalesType, SalesStatus, CategoryTypes } from '@prisma/client';
import { InventoryBatchAllocation, ProcessedInventoryItem, ReservationPreview } from './interfaces/inventory-sale/inventory-sale.interface';
import { SalesGateway } from '../websocket/websocket.gateway';


interface ReservationItem {
  inventoryId: string;
  quantity: number;
  batchAllocations: InventoryBatchAllocation[];
  unitPrice: number;
  totalPrice: number;
}

@Injectable()
export class InventorySalesService {
  private readonly RESERVATION_TTL_MINUTES = 15; // 15 minutes to complete purchase

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
    private readonly storesService: StoresService,
    private readonly paymentService: PaymentService,
    private readonly webSocketGateway: SalesGateway,
  ) {
    // Clean up expired reservations every 5 minutes
    setInterval(() => this.cleanupExpiredReservations(), 5 * 60 * 1000);
  }

  /**
   * Step 1: Create reservation with price preview (Store-Enhanced)
   * Solves both concurrency and pricing issues with store-scoped inventory
   */
  async createReservationWithPreview(dto: Omit<CreateInventorySalesDto, 'receiptNumber'>): Promise<ReservationPreview> {
    const tenantId = this.tenantContext.requireTenantId();

    // Get store context - fallback to main store if not available
    let storeId = this.storeContext.getStoreId();
    if (!storeId) {
      const mainStore = await this.storesService.findMainStore(tenantId);
      storeId = mainStore?.id;
    }

    if (!storeId) {
      throw new BadRequestException('Store context required for inventory reservations');
    }

    const reservationId = this.generateReservationId();
    const expiresAt = new Date(Date.now() + this.RESERVATION_TTL_MINUTES * 60 * 1000);

    // Validate customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId, tenantId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID: ${dto.customerId} not found`);
    }

    const reservationItems: ReservationItem[] = [];
    const availability = { available: true, issues: [] };

    await this.prisma.$transaction(async (prisma) => {
      // Process each inventory item
      for (const item of dto.inventoryItems) {
        const inventoryData = await this.fetchSingleInventoryWithBatches(item.inventoryId, tenantId);

        if (!inventoryData) {
          availability.available = false;
          availability.issues.push(`Inventory ${item.inventoryId} not found`);
          continue;
        }

        try {
          // Try to allocate from store-available batches
          const { batchAllocations, totalPrice } = await this.allocateFromStoreBatches(
            item.inventoryId,
            item.quantity,
            storeId,
            tenantId
          );

          // Create reservation record
          await prisma.inventoryReservation.create({
            data: {
              reservationId,
              inventoryId: item.inventoryId,
              quantity: item.quantity,
              customerId: dto.customerId, // Add this required field
              tenantId,
              expiresAt,
              status: 'ACTIVE',
              batchAllocations: JSON.stringify(batchAllocations), // Store allocation details
              unitPrice: totalPrice / item.quantity,
              totalPrice,
            }
          });

          // Atomically reserve quantities from batches and store allocations
          for (const allocation of batchAllocations) {
            // Reserve from main inventory batch
            const batchUpdateResult = await prisma.inventoryBatch.updateMany({
              where: {
                id: allocation.batchId,
                tenantId,
                remainingQuantity: { gte: allocation.quantity }
              },
              data: {
                reservedQuantity: { increment: allocation.quantity }
                // Don't decrement remainingQuantity during reservation, only during sale completion
              }
            });

            if (batchUpdateResult.count === 0) {
              throw new BadRequestException(
                `Insufficient quantity in batch ${allocation.batchId}`
              );
            }

            // Reserve from store allocation if present
            if (allocation.storeAllocationId) {
              const storeUpdateResult = await prisma.storeBatchAllocation.updateMany({
                where: {
                  id: allocation.storeAllocationId,
                  remainingQuantity: { gte: allocation.quantity }
                },
                data: {
                  remainingQuantity: { decrement: allocation.quantity }
                }
              });

              if (storeUpdateResult.count === 0) {
                throw new BadRequestException(
                  `Insufficient quantity in store allocation ${allocation.storeAllocationId}`
                );
              }
            }
          }

          reservationItems.push({
            inventoryId: item.inventoryId,
            quantity: item.quantity,
            batchAllocations,
            unitPrice: totalPrice / item.quantity,
            totalPrice,
          });

        } catch (error) {
          availability.available = false;
          availability.issues.push(
            `${inventoryData.name}: ${error.message}`
          );
        }
      }

      // If any item failed, rollback is automatic due to transaction
      if (!availability.available) {
        throw new BadRequestException(`Reservation failed: ${availability.issues.join(', ')}`);
      }
    });

    // Calculate pricing
    const subtotal = reservationItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const miscellaneousTotal = dto.miscellaneousCharges
      ? Object.values(dto.miscellaneousCharges).reduce((sum, value) => sum + Number(value), 0)
      : 0;
    const finalTotal = subtotal + miscellaneousTotal;

    // Convert to ProcessedInventoryItem format
    const processedItems: ProcessedInventoryItem[] = reservationItems.map(item => ({
      inventoryId: item.inventoryId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      batchAllocations: item.batchAllocations,
      devices: dto.inventoryItems.find(i => i.inventoryId === item.inventoryId)?.devices || [],
    }));

    // Emit real-time update
    this.webSocketGateway.emitEvent('inventory_reserved', {
      reservationId,
      customerId: dto.customerId,
      itemCount: processedItems.length,
      totalAmount: finalTotal,
      expiresAt,
    });

    return {
      reservationId,
      items: processedItems,
      pricing: {
        subtotal,
        miscellaneousTotal,
        finalTotal,
      },
      availability,
      expiresAt,
    };
  }

  /**
   * Step 2: Complete sale using reservation
   * Fast execution since inventory is already reserved
   */
  async completeSaleFromReservation(
    creatorId: string,
    reservationId: string,
    paymentDetails: {
      paymentType: PaymentType;
      receiptNumber?: string;
      miscellaneousCharges?: Record<string, number>;
    }
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    // Fetch reservation details
    const reservationData = await this.getActiveReservation(reservationId, tenantId);
    if (!reservationData) {
      throw new NotFoundException('Reservation not found or expired');
    }

    // Validate receipt number if provided
    if (paymentDetails.receiptNumber) {
      const existingReceipt = await this.prisma.sales.findFirst({
        where: { receiptNumber: paymentDetails.receiptNumber, tenantId },
      });
      if (existingReceipt) {
        throw new BadRequestException(`Receipt number ${paymentDetails.receiptNumber} already exists`);
      }
    }

    // Calculate final total
    const subtotal = reservationData.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const miscTotal = paymentDetails.miscellaneousCharges
      ? Object.values(paymentDetails.miscellaneousCharges).reduce((sum, value) => sum + Number(value), 0)
      : 0;
    const finalTotal = subtotal + miscTotal;

    let sale: any;
    let paymentResponse = null;

    await this.prisma.$transaction(async (prisma) => {
      // Create the main sales record
      sale = await prisma.sales.create({
        data: {
          tenantId,
          salesType: SalesType.INVENTORY,
          customerId: reservationData.customerId,
          totalPrice: finalTotal,
          status: this.getInitialStatus(paymentDetails.paymentType),
          paymentType: paymentDetails.paymentType,
          receiptNumber: paymentDetails.receiptNumber,
          miscellaneousCharges: paymentDetails.miscellaneousCharges,
          creatorId,
          category: CategoryTypes.INVENTORY,
          reservationId, // Link to reservation
        },
        include: { customer: true },
      });

      // Create sale items from reservation
      await this.createSaleItemsFromReservation(prisma, sale.id, reservationData.items, tenantId);

      // Convert reservations to actual sales (remove from reserved, don't change remaining)
      await this.confirmReservationAllocations(prisma, reservationId, tenantId);

      // Mark reservation as completed
      await prisma.inventoryReservation.updateMany({
        where: { reservationId, tenantId },
        data: { status: 'COMPLETED', completedAt: new Date() }
      });

      // Handle immediate payments
      if (paymentDetails.paymentType === PaymentType.CASH || paymentDetails.paymentType === PaymentType.POS) {
        await this.handleImmediatePayment(
          prisma,
          sale.id,
          finalTotal,
          paymentDetails.paymentType,
          paymentDetails.receiptNumber,
          tenantId
        );
      }
    });

    // Handle SYSTEM payments (async)
    if (paymentDetails.paymentType === PaymentType.SYSTEM) {
      paymentResponse = await this.handleSystemPayment(sale, finalTotal, tenantId);
    }

    // Emit completion event
    this.webSocketGateway.emitEvent('inventory_sale_completed', {
      saleId: sale.id,
      reservationId,
      customerId: sale.customerId,
      totalAmount: finalTotal,
      status: sale.status,
    });

    return {
      sale,
      paymentResponse,
      message: this.getResponseMessage(paymentDetails.paymentType),
    };
  }

  /**
   * Get reservation details for preview/confirmation
   */
  async getReservationDetails(reservationId: string): Promise<ReservationPreview | null> {
    const tenantId = this.tenantContext.requireTenantId();
    const reservationData = await this.getActiveReservation(reservationId, tenantId);

    if (!reservationData) return null;

    const subtotal = reservationData.items.reduce((sum, item) => sum + item.totalPrice, 0);

    return {
      reservationId,
      items: reservationData.items,
      pricing: {
        subtotal,
        miscellaneousTotal: 0, // Will be calculated at completion
        finalTotal: subtotal,
      },
      availability: { available: true, issues: [] },
      expiresAt: reservationData.expiresAt,
    };
  }

  /**
   * Cancel/Release reservation
   */
  async cancelReservation(reservationId: string): Promise<void> {
    const tenantId = this.tenantContext.requireTenantId();

    await this.prisma.$transaction(async (prisma) => {
      // Get reservation items
      const reservations = await prisma.inventoryReservation.findMany({
        where: { reservationId, tenantId, status: 'ACTIVE' }
      });

      for (const reservation of reservations) {
        const batchAllocations: InventoryBatchAllocation[] = JSON.parse(reservation.batchAllocations);

        // Release reserved quantities back to available
        for (const allocation of batchAllocations) {
          // Update main inventory batch
          await prisma.inventoryBatch.updateMany({
            where: { id: allocation.batchId, tenantId },
            data: {
              reservedQuantity: { decrement: allocation.quantity }
              // Don't increment remainingQuantity as it wasn't decremented during reservation
            }
          });

          // Release store allocation if present
          if (allocation.storeAllocationId) {
            await prisma.storeBatchAllocation.updateMany({
              where: { id: allocation.storeAllocationId },
              data: {
                remainingQuantity: { increment: allocation.quantity }
              }
            });
          }
        }
      }

      // Mark reservation as cancelled
      await prisma.inventoryReservation.updateMany({
        where: { reservationId, tenantId },
        data: { status: 'CANCELLED', cancelledAt: new Date() }
      });
    });

    this.webSocketGateway.emitEvent('reservation_cancelled', { reservationId });
  }

  // Private helper methods
  private async getActiveReservation(reservationId: string, tenantId: string) {
    const reservations = await this.prisma.inventoryReservation.findMany({
      where: {
        reservationId,
        tenantId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() }
      },
      include: {
        inventory: { select: { id: true, name: true } }
      }
    });

    if (reservations.length === 0) return null;

    const items: ProcessedInventoryItem[] = reservations.map(res => ({
      inventoryId: res.inventoryId,
      quantity: res.quantity,
      unitPrice: res.unitPrice,
      totalPrice: res.totalPrice,
      batchAllocations: JSON.parse(res.batchAllocations),
      devices: [], // Will be added during sale completion
    }));

    return {
      customerId: reservations[0].customerId,
      items,
      expiresAt: reservations[0].expiresAt,
    };
  }

  private async fetchSingleInventoryWithBatches(inventoryId: string, tenantId: string) {
    return await this.prisma.inventory.findUnique({
      where: { id: inventoryId, tenantId },
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
  }

  private async createSaleItemsFromReservation(
    prisma: any,
    saleId: string,
    items: ProcessedInventoryItem[],
    tenantId: string
  ) {
    const operations = items.map(item =>
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
      })
    );

    await Promise.all(operations);
  }

  private async confirmReservationAllocations(prisma: any, reservationId: string, tenantId: string) {
    const reservations = await prisma.inventoryReservation.findMany({
      where: { reservationId, tenantId, status: 'ACTIVE' }
    });

    for (const reservation of reservations) {
      const batchAllocations: InventoryBatchAllocation[] = JSON.parse(reservation.batchAllocations);

      // Move from reserved to sold (reduce reservedQuantity, remainingQuantity stays the same)
      for (const allocation of batchAllocations) {
        // Update main inventory batch
        await prisma.inventoryBatch.updateMany({
          where: { id: allocation.batchId, tenantId },
          data: {
            reservedQuantity: { decrement: allocation.quantity },
            remainingQuantity: { decrement: allocation.quantity } // Actually reduce available quantity
          }
        });

        // Update store allocation if present
        if (allocation.storeAllocationId) {
          await prisma.storeBatchAllocation.updateMany({
            where: { id: allocation.storeAllocationId },
            data: {
              remainingQuantity: { decrement: allocation.quantity }
            }
          });
        }
      }
    }
  }

  /**
   * Get inventory availability for a specific store
   */
  async getStoreInventoryAvailability(inventoryId: string, storeId?: string) {
    const tenantId = this.tenantContext.requireTenantId();
    
    // Determine store ID
    let targetStoreId = storeId;
    if (!targetStoreId) {
      targetStoreId = this.storeContext.getStoreId();
      if (!targetStoreId) {
        const mainStore = await this.storesService.findMainStore(tenantId);
        targetStoreId = mainStore?.id;
      }
    }

    if (!targetStoreId) {
      throw new BadRequestException('Store context required');
    }

    // Get store-specific batch allocations
    const storeAllocations = await this.prisma.storeBatchAllocation.findMany({
      where: {
        storeId: targetStoreId,
        batch: {
          inventoryId,
          tenantId,
          remainingQuantity: { gt: 0 }
        }
      },
      include: {
        batch: {
          include: {
            inventory: {
              select: {
                id: true,
                name: true,
                sku: true,
                image: true
              }
            }
          }
        }
      }
    });

    const totalAllocated = storeAllocations.reduce(
      (sum, allocation) => sum + allocation.allocatedQuantity, 
      0
    );
    
    const totalAvailable = storeAllocations.reduce(
      (sum, allocation) => sum + Math.min(allocation.remainingQuantity, allocation.batch.remainingQuantity), 
      0
    );

    const batches = storeAllocations.map(allocation => ({
      batchId: allocation.batch.id,
      batchNumber: allocation.batch.batchNumber,
      price: allocation.batch.price,
      costOfItem: allocation.batch.costOfItem,
      allocatedToStore: allocation.allocatedQuantity,
      availableInStore: Math.min(allocation.remainingQuantity, allocation.batch.remainingQuantity),
      createdAt: allocation.batch.createdAt
    }));

    return {
      inventoryId,
      inventory: storeAllocations[0]?.batch.inventory || null,
      storeId: targetStoreId,
      totalAllocated,
      totalAvailable,
      batches
    };
  }

  private generateReservationId(): string {
    return `RES-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async cleanupExpiredReservations() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return;

    try {
      const expiredReservations = await this.prisma.inventoryReservation.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          expiresAt: { lt: new Date() }
        }
      });

      for (const reservation of expiredReservations) {
        await this.cancelReservation(reservation.reservationId);
      }
    } catch (error) {
      console.error('Error cleaning up expired reservations:', error);
    }
  }
  async createInventorySale(creatorId: string, dto: CreateInventorySalesDto) {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate and pre-fetch all required data in a single transaction
    const { inventoryData } = await this.validateAndFetchData(dto, tenantId);

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


  /**
   * Store-aware batch allocation method
   * Allocates from batches that are available in the specific store
   */
  private async allocateFromStoreBatches(
    inventoryId: string,
    requiredQuantity: number,
    storeId: string,
    tenantId: string
  ): Promise<{ batchAllocations: InventoryBatchAllocation[]; totalPrice: number }> {
    // Get store-specific batch allocations
    const storeAllocations = await this.prisma.storeBatchAllocation.findMany({
      where: {
        storeId,
        remainingQuantity: { gt: 0 },
        batch: {
          inventoryId,
          tenantId,
          remainingQuantity: { gt: 0 }
        }
      },
      include: {
        batch: true
      },
      orderBy: { createdAt: 'asc' } // FIFO allocation
    });

    const allocations: InventoryBatchAllocation[] = [];
    let remainingQty = requiredQuantity;
    let totalPrice = 0;

    // FIFO allocation from store-allocated batches
    for (const storeAllocation of storeAllocations) {
      if (remainingQty <= 0) break;

      const availableInStore = Math.min(
        storeAllocation.remainingQuantity,
        storeAllocation.batch.remainingQuantity
      );

      const allocatedQty = Math.min(availableInStore, remainingQty);
      if (allocatedQty <= 0) continue;

      const allocationPrice = storeAllocation.batch.price * allocatedQty;
      allocations.push({
        batchId: storeAllocation.batch.id,
        quantity: allocatedQty,
        unitPrice: storeAllocation.batch.price,
        storeAllocationId: storeAllocation.id, // Track store allocation
      });

      totalPrice += allocationPrice;
      remainingQty -= allocatedQty;
    }

    if (remainingQty > 0) {
      throw new BadRequestException(
        `Insufficient inventory quantity in store. Required: ${requiredQuantity}, Available: ${requiredQuantity - remainingQty}`
      );
    }

    return { batchAllocations: allocations, totalPrice };
  }

  /**
   * Legacy method for backward compatibility
   */
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
}    // 
================