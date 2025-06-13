import { Module } from '@nestjs/common';
import { SalesGateway } from './websocket.gateway';

@Module({
  providers: [SalesGateway],
  exports: [SalesGateway],
})
export class WebSocketModule {}