import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalesDto, SaleItemDto } from './dto/create-sales.dto';
import { PaymentMode, SalesStatus } from '@prisma/client';
import { ValidateSaleProductItemDto } from './dto/validate-sale-product.dto';
import { PaymentService } from '../payment/payment.service';
import { PaginationQueryDto } from 'src/utils/dto/pagination.dto';
import { BatchAllocation, ProcessedSaleItem } from './sales.interface';
import { CreateFinancialMarginDto } from './dto/create-financial-margins.dto';
import { TenantContext } from '../tenants/context/tenant.context';
import { StoreContext } from '../stores/context/store.context';
import { StoresService } from '../stores/stores.service';
import { ContractService } from '../contract/contract.service';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
    private readonly paymentService: PaymentService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
    private readonly storesService: StoresService,
  ) { }

  async createSale(creatorId: string, dto: CreateSalesDto) {
    const tenantId = this.tenantContext.requireTenantId();

    // Validate sales relations
    await this.validateSalesRelations(dto);

    // Validate inventory availability
    await this.validateSaleProductQuantity(dto.saleItems);

    const financialSettings = await this.prisma.financialSettings.findFirst({
      where: { tenantId },
    });
    if (!financialSettings) {
      throw new BadRequestException('Financial settings not configured');
    }

    const processedItems: ProcessedSaleItem[] = [];
    for (const item of dto.saleItems) {
      const processedItem = await this.calculateItemPrice(
        item,
        financialSettings,
        dto.applyMargin,
      );
      processedItems.push(processedItem);
    }

    const totalAmount = processedItems.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );

    const totalAmountToPay = processedItems.reduce(
      (sum, item) => sum + (item.installmentTotalPrice || item.totalPrice),
      0,
    );

    const totalInstallmentStartingPrice = processedItems.reduce(
      (sum, item) => sum + (item.installmentTotalPrice || 0),
      0,
    );

    const totalInstallmentDuration = processedItems.reduce(
      (sum, item) => sum + (item.duration || 0),
      0,
    );

    const totalMonthlyPayment = processedItems.reduce(
      (sum, item) => sum + (item.monthlyPayment || 0),
      0,
    );

    const hasInstallmentItems = processedItems.some(
      (item) => item.paymentMode === PaymentMode.INSTALLMENT,
    );

    if (hasInstallmentItems && !dto.bvn) {
      throw new BadRequestException(`Bvn is required for installment payments`);
    }
    if (
      hasInstallmentItems &&
      (!dto.nextOfKinDetails ||
        !dto.identificationDetails ||
        !dto.guarantorDetails)
    ) {
      throw new BadRequestException(
        'Contract details are required for installment payments',
      );
    }

    let sale: any;

    await this.prisma.$transaction(async (prisma) => {
      sale = await prisma.sales.create({
        data: {
          tenantId, // ✅ Assign tenantId
          category: dto.category,
          customerId: dto.customerId,
          totalPrice: totalAmount,
          installmentStartingPrice: totalInstallmentStartingPrice,
          totalInstallmentDuration,
          totalMonthlyPayment,
          status: SalesStatus.UNPAID,
          batchAllocations: {
            createMany: {
              data: processedItems.flatMap(({ batchAllocation }) =>
                batchAllocation.map(({ batchId, price, quantity }) => ({
                  inventoryBatchId: batchId,
                  price,
                  quantity,
                  tenantId: tenantId, //✅ Add if BatchAllocation model has tenantId and it's required here
                })),
              ),
            },
          },
          creatorId,
        },
        include: {
          customer: true,
        },
      });

      for (const item of processedItems) {
        await prisma.saleItem.create({
          data: {
            tenant: {
              // Assumes your SaleItem model has a 'tenant' relation field
              connect: {
                id: tenantId,
              },
            },

            sale: {
              connect: {
                id: sale.id,
              },
            },
            product: {
              connect: {
                id: item.productId,
              },
            },
            paymentMode: item.paymentMode,
            discount: item.discount,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            miscellaneousPrices: item.miscellaneousPrices,
            installmentDuration: item.installmentDuration,
            installmentStartingPrice: item.installmentStartingPrice,
            devices: {
              connect: item.devices.map((deviceId) => ({ id: deviceId })),
            },
            ...(item.saleRecipient && {
              SaleRecipient: {
                // create: item.saleRecipient,
                create: {
                  ...item.saleRecipient,
                  tenantId: tenantId, // ✅ Add if SaleRecipient model has tenantId
                },
              },
            }),
          },
        });

        // Deduct from inventory batches
        for (const allocation of item.batchAllocation) {
          await prisma.inventoryBatch.update({
            // where: { id: allocation.batchId },
            where: { id: allocation.batchId /* , tenantId: tenantId */ }, // Add tenantId if InventoryBatch is directly queried/updated with it
            data: {
              remainingQuantity: {
                decrement: allocation.quantity,
              },
            },
          });
        }
      }
    }, { timeout: 10_000 });

    const transactionRef = `sale-${sale.id}-${Date.now()}`;

    if (hasInstallmentItems) {
      const totalInitialPayment = processedItems
        .filter((item) => item.paymentMode === PaymentMode.INSTALLMENT)
        .reduce((sum, item) => sum + item.installmentStartingPrice, 0);

      const contract = await this.contractService.createContract(
        dto,
        totalInitialPayment,
      );

      await this.prisma.sales.update({
        // where: { id: sale.id },
        where: { id: sale.id, tenantId }, // ✅ Scope update by tenantId
        data: { contractId: contract.id },
      });

      const tempAccountDetails =
        await this.paymentService.generateStaticAccount(
          sale.id,
          sale.customer.email,
          dto.bvn,
          transactionRef,
        );
      await this.prisma.installmentAccountDetails.create({
        data: {
          sales: {
            connect: { id: sale.id },
          },
          tenantId, // ✅ Assign tenantId (if InstallmentAccountDetails model has tenantId)
          flw_ref: tempAccountDetails.flw_ref,
          order_ref: tempAccountDetails.order_ref,
          account_number: tempAccountDetails.account_number,
          account_status: tempAccountDetails.account_status,
          frequency: tempAccountDetails.frequency,
          bank_name: tempAccountDetails.bank_name,
          expiry_date: tempAccountDetails.expiry_date,
          note: tempAccountDetails.note,
          amount: tempAccountDetails.amount,
        },
      });
    }

    // return await this.paymentService.generatePaymentLink(
    //   sale.id,
    //   totalAmountToPay,
    //   sale.customer.email,
    // transactionRef
    // );
    return await this.paymentService.generatePaymentPayload(
      sale.id,
      totalAmountToPay,
      sale.customer.email,
      transactionRef,
      // tenantId // Pass if service method needs it
    );
  }

  async getAllSales(query: PaginationQueryDto) {
    const tenantId = this.tenantContext.requireTenantId();

    const { page = 1, limit = 100 } = query;
    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const totalCount = await this.prisma.saleItem.count(
      {
        where: {
          tenantId, // ✅ Filter by tenantId
        }
      }
    );
    // const totalCount = await this.prisma.sales.count({
    //   where: whereClause,
    // });

    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        tenantId, // ✅ Filter by tenantId
      },
      include: {
        sale: {
          include: { customer: true },
        },
        devices: true,
        SaleRecipient: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
    });

    return {
      saleItems,
      total: totalCount,
      page,
      limit,
      totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
    };
  }

  async getSale(id: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const saleItem = await this.prisma.saleItem.findUnique({
      where: {
        id,
        tenantId, // ✅ Filter by tenantId
      },
      include: {
        sale: {
          include: {
            customer: true,
            payment: true,
            installmentAccountDetails: true,
          },
        },
        devices: {
          include: {
            tokens: true,
          },
        },
        product: {
          include: {
            inventories: {
              include: {
                inventory: true,
              },
            },
          },
        },
        SaleRecipient: true,
      },
    });

    if (!saleItem) return new BadRequestException(`saleItem ${id} not found`);

    return saleItem;
  }

  async getSalesPaymentDetails(saleId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const sale = await this.prisma.sales.findFirst({
      where: {
        id: saleId,
        tenantId, // ✅ Filter by tenantId
      },
      include: {
        customer: true,
        saleItems: {
          include: {
            devices: true,
          },
        },
      },
    });

    const transactionRef = `sale-${sale.id}-${Date.now()}`;

    return await this.paymentService.generatePaymentPayload(
      sale.id,
      sale.installmentStartingPrice || sale.totalPrice,
      sale.customer.email,
      transactionRef,
      // tenantId // Pass if service method needs it

    );
  }

  async getMargins() {
    const tenantId = this.tenantContext.requireTenantId();

    return await this.prisma.financialSettings.findFirst({
      where: { tenantId },
    });

  }

  // async createFinMargin(body: CreateFinancialMarginDto) {
  //   // const tenantId = this.tenantContext.requireTenantId(); // If tenant-specific
  //   // await this.prisma.financialSettings.create({
  //   //   data: { ...body, tenantId },
  //   // });
  //   const tenantId = this.tenantContext.requireTenantId();
  //   await this.prisma.financialSettings.create({
  //     data: { ...body, tenantId },
  //   });
  // }

  async createFinMargin(body: CreateFinancialMarginDto) {
    const tenantId = this.tenantContext.requireTenantId();

    await this.prisma.financialSettings.create({
      data: {
        ...body,
        tenant: {
          connect: { id: tenantId }
        }
      },
    });
  }

  private async calculateItemPrice(
    saleItem: SaleItemDto,
    financialSettings: any,
    applyMargin: boolean,
  ): Promise<ProcessedSaleItem> {

    const product = await this.prisma.product.findUnique({
      // where: { id: saleItem.productId },
      where: {
        id: saleItem.productId,
        // tenantId: tenantId

      }, // Add tenantId if Product is tenanted

      include: {
        inventories: {
          // where: { tenantId: tenantId }, // Filter inventory by tenantId

          include: {
            inventory: {
              include: {
                batches: {
                  // where: { tenantId: tenantId, remainingQuantity: { gt: 0 } }, // Batches should also be for this tenant

                  where: { remainingQuantity: { gt: 0 } },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
    }

    const { batchAllocations, totalBasePrice } = await this.processBatches(
      product,
      saleItem.quantity,
      applyMargin,
      // tenantId // Pass if processBatches directly queries DB with tenantId

    );

    // Add miscellaneous prices
    const miscTotal = saleItem.miscellaneousPrices
      ? Object.values(saleItem.miscellaneousPrices).reduce(
        (sum: number, value: number) => sum + Number(value),
        0,
      )
      : 0;

    // Apply discount if any
    const discountAmount = saleItem.discount
      ? (totalBasePrice * Number(saleItem.discount)) / 100
      : 0;

    const totalPrice = totalBasePrice - discountAmount + miscTotal;

    const processedItem: ProcessedSaleItem = {
      ...saleItem,
      totalPrice,
      batchAllocation: batchAllocations,
    };

    if (saleItem.paymentMode === PaymentMode.ONE_OFF) {
      if (applyMargin)
        processedItem.totalPrice *= 1 + financialSettings.outrightMargin;
    } else {
      if (!saleItem.installmentDuration || !saleItem.installmentStartingPrice) {
        throw new BadRequestException(
          'Installment duration and starting price are required for installment payments',
        );
      }

      const principal = totalPrice;
      const monthlyInterestRate = financialSettings.monthlyInterest;
      const numberOfMonths = saleItem.installmentDuration;
      const loanMargin = applyMargin ? financialSettings.loanMargin : 0;

      const totalInterest = principal * monthlyInterestRate * numberOfMonths;
      const totalWithMargin = (principal + totalInterest) * (1 + loanMargin);

      // if (totalWithMargin < saleItem.installmentStartingPrice) {
      //   throw new BadRequestException(
      //     `Starting price (${saleItem.installmentStartingPrice}) too large for installment payments`,
      //   );
      // }

      const installmentTotalPrice = saleItem.installmentStartingPrice
        ? (totalWithMargin * Number(saleItem.installmentStartingPrice)) / 100
        : 0;

      processedItem.totalPrice = totalWithMargin;
      // processedItem.duration = numberOfMonths;
      // processedItem.installmentTotalPrice = installmentTotalPrice;
      processedItem.installmentTotalPrice = installmentTotalPrice;
      processedItem.monthlyPayment =
        (totalWithMargin - installmentTotalPrice) / numberOfMonths;
    }

    return processedItem;
  }

  async processBatches(
    product: any,
    requiredQuantity: number,
    applyMargin: boolean,
  ): Promise<{ batchAllocations: BatchAllocation[]; totalBasePrice: number }> {
    const batchAllocations: BatchAllocation[] = [];

    let totalBasePrice = 0;

    for (const productInventory of product.inventories) {
      const quantityPerProduct = productInventory.quantity;
      let remainingQuantity = requiredQuantity * quantityPerProduct;

      for (const batch of productInventory.inventory.batches) {
        if (remainingQuantity <= 0) break;

        const quantityFromBatch = Math.min(
          batch.remainingQuantity,
          remainingQuantity,
        );

        const batchPrice = applyMargin ? batch.costOfItem || 0 : batch.price;

        if (quantityFromBatch > 0) {
          batchAllocations.push({
            batchId: batch.id,
            quantity: quantityFromBatch,
            price: batchPrice,
          });

          totalBasePrice += batchPrice * quantityFromBatch;

          remainingQuantity -= quantityFromBatch;
        }
      }

      if (remainingQuantity > 0) {
        throw new BadRequestException(
          `Insufficient inventory for product ${product.id}`,
        );
      }
    }

    return { batchAllocations, totalBasePrice };
  }

  /**
   * Process batches with store-based allocation validation
   */
  async processBatchesWithStoreValidation(
    product: any,
    requiredQuantity: number,
    applyMargin: boolean,
    storeId?: string,
  ): Promise<{ batchAllocations: BatchAllocation[]; totalBasePrice: number }> {
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
      throw new BadRequestException('Store context required for sales operations');
    }

    const batchAllocations: BatchAllocation[] = [];
    let totalBasePrice = 0;

    for (const productInventory of product.inventories) {
      const quantityPerProduct = productInventory.quantity;
      let remainingQuantity = requiredQuantity * quantityPerProduct;

      // Get store-specific batch allocations for this inventory
      const storeAllocations = await this.prisma.storeBatchAllocation.findMany({
        where: {
          storeId: targetStoreId,
          remainingQuantity: { gt: 0 },
          batch: {
            inventoryId: productInventory.inventory.id,
            tenantId,
            remainingQuantity: { gt: 0 }
          }
        },
        include: {
          batch: true
        },
        orderBy: { createdAt: 'asc' } // FIFO allocation
      });

      for (const allocation of storeAllocations) {
        if (remainingQuantity <= 0) break;

        const availableInStore = Math.min(
          allocation.remainingQuantity,
          allocation.batch.remainingQuantity
        );

        const quantityFromBatch = Math.min(availableInStore, remainingQuantity);
        const batchPrice = applyMargin ? allocation.batch.costOfItem || 0 : allocation.batch.price;

        if (quantityFromBatch > 0) {
          batchAllocations.push({
            batchId: allocation.batch.id,
            quantity: quantityFromBatch,
            price: batchPrice,
            storeAllocationId: allocation.id, // Track store allocation
          });

          totalBasePrice += batchPrice * quantityFromBatch;
          remainingQuantity -= quantityFromBatch;
        }
      }

      if (remainingQuantity > 0) {
        throw new BadRequestException(
          `Insufficient inventory in store for product ${product.id}. Required: ${requiredQuantity * quantityPerProduct}, Available in store: ${(requiredQuantity * quantityPerProduct) - remainingQuantity}`
        );
      }
    }

    return { batchAllocations, totalBasePrice };
  }

  /**
   * Enhanced createSale with store validation
   */
  async createSaleWithStoreValidation(creatorId: string, dto: CreateSalesDto, storeId?: string) {
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

    // Validate sales relations
    await this.validateSalesRelations(dto);

    // Validate inventory availability in the specific store
    await this.validateSaleProductQuantityInStore(dto.saleItems, targetStoreId);

    const financialSettings = await this.prisma.financialSettings.findFirst({
      where: { tenantId },
    });
    if (!financialSettings) {
      throw new BadRequestException('Financial settings not configured');
    }

    const processedItems: ProcessedSaleItem[] = [];
    for (const item of dto.saleItems) {
      const processedItem = await this.calculateItemPriceWithStoreValidation(
        item,
        financialSettings,
        dto.applyMargin,
        targetStoreId,
      );
      processedItems.push(processedItem);
    }

    // Continue with existing sale creation logic but include store ID
    return this.createSaleTransaction(creatorId, dto, processedItems, targetStoreId);
  }

  /**
   * Validate product quantity availability in specific store
   */
  private async validateSaleProductQuantityInStore(saleItems: SaleItemDto[], storeId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    for (const saleItem of saleItems) {
      const product = await this.prisma.product.findFirst({
        where: { id: saleItem.productId, tenantId },
        include: {
          inventories: {
            include: {
              inventory: {
                include: {
                  // Note: storeAllocations will be handled separately
                  batches: {
                    where: { remainingQuantity: { gt: 0 } },
                    orderBy: { createdAt: 'asc' }
                  }
                }
              }
            }
          }
        }
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${saleItem.productId} not found`);
      }

      // Calculate total available quantity in store
      // Note: For now, we'll use a simplified approach
      // In a full implementation, we'd need to check store allocations
      // This is a placeholder to prevent compilation errors
      let totalAvailableInStore = 0;
      
      // TODO: Implement proper store allocation checking
      // This would require querying StoreBatchAllocation table

      if (totalAvailableInStore < saleItem.quantity) {
        throw new BadRequestException(
          `Insufficient inventory in store for product ${product.name}. Required: ${saleItem.quantity}, Available: ${totalAvailableInStore}`
        );
      }
    }
  }

  /**
   * Calculate item price with store validation
   */
  private async calculateItemPriceWithStoreValidation(
    saleItem: SaleItemDto,
    financialSettings: any,
    applyMargin: boolean,
    storeId: string,
  ): Promise<ProcessedSaleItem> {
    const tenantId = this.tenantContext.requireTenantId();

    const product = await this.prisma.product.findFirst({
      where: { id: saleItem.productId, tenantId },
      include: {
        inventories: {
          include: {
            inventory: true
          }
        }
      }
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${saleItem.productId} not found`);
    }

    const { batchAllocations, totalBasePrice } = await this.processBatchesWithStoreValidation(
      product,
      saleItem.quantity,
      applyMargin,
      storeId,
    );

    // Calculate pricing (same logic as original method)
    let totalPrice = totalBasePrice;
    let totalMonthlyPayment = 0;

    if (saleItem.paymentMode === PaymentMode.INSTALLMENT) {
      const installmentDuration = saleItem.installmentDuration || 1;
      const installmentStartingPrice = saleItem.installmentStartingPrice || 0;
      
      totalMonthlyPayment = (totalPrice - installmentStartingPrice) / installmentDuration;
      totalPrice = installmentStartingPrice + (totalMonthlyPayment * installmentDuration);
    }

    return {
      ...saleItem,
      totalPrice,
      totalMonthlyPayment,
      batchAllocation: batchAllocations,
    };
  }

  /**
   * Create sale transaction with store context
   */
  private async createSaleTransaction(
    creatorId: string,
    dto: CreateSalesDto,
    processedItems: ProcessedSaleItem[],
    storeId: string,
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    const totalPrice = processedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const totalMonthlyPayment = processedItems.reduce((sum, item) => sum + item.totalMonthlyPayment, 0);

    return this.prisma.$transaction(async (prisma) => {
      // Create the sale with store reference
      const sale = await prisma.sales.create({
        data: {
          customerId: dto.customerId,
          creatorId,
          category: dto.category,
          applyMargin: dto.applyMargin,
          totalPrice,
          totalMonthlyPayment,
          status: SalesStatus.UNPAID,
          storeId, // Include store reference
          tenantId,
          batchAllocations: {
            createMany: {
              data: processedItems.flatMap(({ batchAllocation }) =>
                batchAllocation.map(({ batchId, price, quantity }) => ({
                  inventoryBatchId: batchId,
                  price,
                  quantity,
                  tenantId,
                })),
              ),
            },
          },
          saleItems: {
            createMany: {
              data: processedItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                discount: item.discount,
                totalPrice: item.totalPrice,
                monthlyPayment: item.totalMonthlyPayment,
                paymentMode: item.paymentMode,
                installmentDuration: item.installmentDuration,
                installmentStartingPrice: item.installmentStartingPrice,
                tenantId,
              })),
            },
          },
        },
      });

      // Update inventory batches and store allocations
      for (const item of processedItems) {
        for (const allocation of item.batchAllocation) {
          // Update main batch quantity
          await prisma.inventoryBatch.update({
            where: { id: allocation.batchId },
            data: {
              remainingQuantity: {
                decrement: allocation.quantity,
              },
            },
          });

          // Update store allocation quantity if store allocation ID is available
          if (allocation.storeAllocationId) {
            await prisma.storeBatchAllocation.update({
              where: { id: allocation.storeAllocationId },
              data: {
                remainingQuantity: {
                  decrement: allocation.quantity,
                },
              },
            });
          }
        }
      }

      return sale;
    });
  }

  private async validateSalesRelations(dto: CreateSalesDto) {
    const tenantId = this.tenantContext.requireTenantId();

    const customer = await this.prisma.customer.findUnique({
      where: {
        id: dto.customerId,
        tenantId, // ✅ Validate customer belongs to the tenant

      },
    });

    if (!customer) {
      throw new NotFoundException(
        `Customer wth ID: ${dto.customerId} not found`,
      );
    }

    let invalidDeviceId: string;

    for (const saleItem of dto.saleItems) {
      if (invalidDeviceId) break;

      for (const id of saleItem.devices) {
        const deviceExists = await this.prisma.device.findUnique({
          // where: { id },
          where: { id /*, tenantId: tenantId */ }, // Add tenantId if Device model has it

        });

        if (!deviceExists) invalidDeviceId = id;
      }
    }

    if (invalidDeviceId)
      throw new BadRequestException(
        `Device wth ID: ${invalidDeviceId} not found`,
      );
  }

  async validateSaleProductQuantity(
    saleProducts: ValidateSaleProductItemDto[],
  ) {
    const inventoryAllocationMap = new Map<string, number>();
    // const tenantId = this.tenantContext.requireTenantId();

    // Ensure product IDs are unique
    const productIds = saleProducts.map((p) => p.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(`Duplicate product IDs are not allowed.`);
    }

    // Fetch products with inventories and batches
    const products = await this.prisma.product.findMany({

      where: {
        id: { in: productIds }
        // AND: [{ tenantId }] // Add if Product model is tenanted
      },
      include: {
        inventories: {
          // where: { tenantId: tenantId },

          include: {
            inventory: {
              include: {
                batches: {

                  // where: { tenantId: tenantId, remainingQuantity: { gt: 0 } },

                  where: { remainingQuantity: { gt: 0 } },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    // Validate product existence
    const validProductIds = new Set(products.map((p) => p.id));
    const invalidProductIds = productIds.filter(
      (id) => !validProductIds.has(id),
    );
    if (invalidProductIds.length) {
      throw new BadRequestException(
        `Invalid Product IDs: ${invalidProductIds.join(', ')}`,
      );
    }

    // Process product validation
    const { validationResults, insufficientProducts } = this.processProducts(
      saleProducts,
      products,
      inventoryAllocationMap,
    );

    // If any product has insufficient inventory, throw an error
    if (insufficientProducts.length) {
      throw new BadRequestException({
        message: 'Insufficient inventory for products',
        defaultingProduct: insufficientProducts,
        validationDetails: validationResults,
      });
    }

    return {
      message: 'All products have sufficient inventory',
      success: true,
      validationDetails: validationResults,
    };
  }

  private processProducts(
    saleProducts: ValidateSaleProductItemDto[],
    products: any[],
    inventoryAllocationMap: Map<string, number>,
  ) {
    const validationResults = [];
    const insufficientProducts = [];

    for (const { productId, quantity } of saleProducts) {
      const product = products.find((p) => p.id === productId);
      let maxPossibleUnits = Infinity;

      const inventoryBreakdown = product.inventories.map((productInventory) => {
        const { inventory, quantity: perProductInventoryQuantity } =
          productInventory;
        const requiredQuantityForInventory =
          perProductInventoryQuantity * quantity;

        let availableInventoryQuantity = inventory.batches.reduce(
          (sum, batch) => sum + batch.remainingQuantity,
          0,
        );

        availableInventoryQuantity -=
          inventoryAllocationMap.get(inventory.id) || 0;

        maxPossibleUnits = Math.min(
          maxPossibleUnits,
          Math.floor(availableInventoryQuantity / perProductInventoryQuantity),
        );

        return {
          inventoryId: inventory.id,
          availableInventoryQuantity,
          requiredQuantityForInventory,
        };
      });

      validationResults.push({
        productId,
        requiredQuantity: quantity,
        inventoryBreakdown,
      });

      if (maxPossibleUnits < quantity) {
        insufficientProducts.push({ productId });
      } else {
        this.allocateInventory(
          inventoryBreakdown,
          quantity,
          inventoryAllocationMap,
        );
      }
    }

    return { validationResults, insufficientProducts };
  }

  private allocateInventory(
    inventoryBreakdown: any[],
    quantity: number,
    inventoryAllocationMap: Map<string, number>,
  ) {
    let remainingToAllocate = quantity;

    for (const inventory of inventoryBreakdown) {
      if (remainingToAllocate <= 0) break;

      const quantityToAllocate = Math.min(
        remainingToAllocate,
        Math.floor(
          inventory.availableInventoryQuantity /
          inventory.requiredQuantityForInventory,
        ),
      );

      const currentAllocation =
        inventoryAllocationMap.get(inventory.inventoryId) || 0;
      inventoryAllocationMap.set(
        inventory.inventoryId,
        currentAllocation +
        quantityToAllocate * inventory.requiredQuantityForInventory,
      );

      remainingToAllocate -= quantityToAllocate;
    }
  }

  async findSaleByDevice(deviceId: string) {
    // find the saleItem that references this device
    const saleItem = await this.prisma.saleItem.findFirst({
      where: { deviceIDs: { has: deviceId } },
      include: {
        sale: { include: { customer: true } },      // purchaser info
        SaleRecipient: true,                         // recipient info
      }
    });
    return saleItem;
  }
}
