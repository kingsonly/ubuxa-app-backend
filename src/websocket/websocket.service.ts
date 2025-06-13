import { Injectable } from '@nestjs/common';
import { SalesGateway } from './websocket.gateway';
import { SalesStatus } from '@prisma/client';

@Injectable()
export class WebSocketService {
  constructor(private readonly webSocketGateway: SalesGateway) {}

  emitInventorySaleCreated(data: {
    saleId: string;
    customerId: string;
    totalAmount: number;
    status: SalesStatus;
  }) {
    this.webSocketGateway.emitEvent('inventory_sale_created', data);
  }

  emitPaymentStatusChanged(data: {
    saleId: string;
    status: SalesStatus;
    amount?: number;
  }) {
    this.webSocketGateway.emitEvent('payment_status_changed', data);
  }

  emitInventoryLowStock(data: {
    inventoryId: string;
    name: string;
    remainingQuantity: number;
  }) {
    this.webSocketGateway.broadcast('inventory_low_stock', data);
  }

  emitServiceSaleCreated(data: {
    saleId: string;
    customerId: string;
    serviceType: string;
    status: SalesStatus;
  }) {
    this.webSocketGateway.emitEvent('service_sale_created', data);
  }

  emitRefundProcessed(data: {
    saleId: string;
    refundAmount: number;
    reason?: string;
  }) {
    this.webSocketGateway.broadcast('refund_processed', data);
  }

  emitInventoryUpdate(data: {
    inventoryId: string;
    action: 'added' | 'updated' | 'deleted';
    details: any;
  }) {
    this.webSocketGateway.broadcast('inventory_update', data);
  }
}