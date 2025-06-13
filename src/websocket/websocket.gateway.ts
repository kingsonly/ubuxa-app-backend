
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*', // Configure properly for production
  },
  namespace: 'sales',
})
@Injectable()
export class SalesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('SalesGateway');
  private clients = new Map<string, Socket>();
  private subscriptions = new Map<string, Set<string>>(); // Map<event, Set<clientId>>

  handleConnection(client: Socket) {
    const clientId = client.id;
    this.clients.set(clientId, client);
    this.logger.log(`Client connected: ${clientId}`);
  }

  handleDisconnect(client: Socket) {
    const clientId = client.id;
    this.clients.delete(clientId);

    // Clean up subscriptions
    this.subscriptions.forEach((clientSet, event) => {
      if (clientSet.has(clientId)) {
        clientSet.delete(clientId);
      }
    });

    this.logger.log(`Client disconnected: ${clientId}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, event: string) {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event).add(client.id);
    this.logger.log(`Client ${client.id} subscribed to ${event}`);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, event: string) {
    if (this.subscriptions.has(event)) {
      this.subscriptions.get(event).delete(client.id);
      this.logger.log(`Client ${client.id} unsubscribed from ${event}`);
    }
  }

  emitEvent(event: string, data: any) {
    if (this.subscriptions.has(event)) {
      const subscribers = this.subscriptions.get(event);
      subscribers.forEach(clientId => {
        const client = this.clients.get(clientId);
        if (client) {
          client.emit(event, data);
        }
      });
    }
    this.logger.log(`Event emitted: ${event}`);
  }

  broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }
}