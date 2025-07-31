import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class StoreContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Extract store ID from headers
    const storeId = req.headers['storeid'] as string || req.headers['store-id'] as string;
    
    if (storeId) {
      req.storeId = storeId;
    }
    
    next();
  }
}