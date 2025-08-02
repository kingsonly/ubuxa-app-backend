import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  Delete,
  NotFoundException,
} from '@nestjs/common';

import { PaginationQueryDto } from 'src/utils/dto/pagination.dto';
import { PaymentType, SalesType } from '@prisma/client';
import { InventorySalesService } from './inventory-sale.service';
import { CreateInventorySalesDto } from './dto/create-inventory-sale.dto/create-inventory-sale.dto';
import { ReservationPreview } from './interfaces/inventory-sale/inventory-sale.interface';

interface CompleteSaleDto {
  paymentType: PaymentType;
  receiptNumber?: string;
  miscellaneousCharges?: Record<string, number>;
}


@Controller('inventory-sales')
export class InventorySalesController {
  constructor(private readonly inventorySalesService: InventorySalesService) { }

   /**
     * LEGACY WORKFLOW - Direct sale creation (kept for backward compatibility)
     * Consider deprecating this in favor of reservation flow
     */

   @Post()
   async createInventorySale(
     @Body() createInventorySalesDto: CreateInventorySalesDto,
     @Req() req: any,
   ) {
     const creatorId = req.user?.id;
     return this.inventorySalesService.createInventorySale(creatorId, createInventorySalesDto);
   }

    /**
   * NEW WORKFLOW - Step 1: Create reservation with price preview
   * Solves both concurrency and pricing preview issues
   */
    /**
     * Get inventory availability for current store
     */
    @Get('availability/:inventoryId')
    async getStoreInventoryAvailability(
      @Param('inventoryId') inventoryId: string,
      @Query('storeId') storeId?: string,
    ) {
      return this.inventorySalesService.getStoreInventoryAvailability(inventoryId, storeId);
    }

    @Post('reserve')
    async createReservationWithPreview(
      @Body() createReservationDto: CreateInventorySalesDto,
    ): Promise<ReservationPreview> {
      return this.inventorySalesService.createReservationWithPreview(createReservationDto);
    }

    /**
     * Step 2: Complete sale from reservation
     */
    @Post('reserve/:reservationId/complete')
    async completeSaleFromReservation(
      @Param('reservationId') reservationId: string,
      @Body() completeSaleDto: CompleteSaleDto,
      @Req() req: any,
    ) {
      const creatorId = req.user?.id;
      return this.inventorySalesService.completeSaleFromReservation(
        creatorId,
        reservationId,
        completeSaleDto
      );
    }

    /**
     * Get reservation details (for confirmation screen)
     */
    @Get('reserve/:reservationId')
    async getReservationDetails(@Param('reservationId') reservationId: string): Promise<ReservationPreview> {
      const reservation = await this.inventorySalesService.getReservationDetails(reservationId);
      if (!reservation) {
        throw new NotFoundException('Reservation not found or expired');
      }
      return reservation;
    }

    /**
     * Cancel reservation (release inventory)
     */
    @Delete('reserve/:reservationId')
    async cancelReservation(@Param('reservationId') reservationId: string) {
      await this.inventorySalesService.cancelReservation(reservationId);
      return { message: 'Reservation cancelled successfully' };
  }

  @Get()
  async getAllSales(
    @Query() query: PaginationQueryDto & { salesType?: SalesType },
  ) {
    return this.inventorySalesService.getAllInventorySales(query);
  }

  @Get(':id')
  async getSaleById(@Param('id') id: string) {
    return this.inventorySalesService.getSaleById(id);
  }

}
