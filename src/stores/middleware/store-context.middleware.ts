import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { decryptStoreId } from 'src/utils/encryptor.decryptor';

// Extend the Request interface to include storeId
declare module 'express' {
  export interface Request {
    storeId?: string;
  }
}

@Injectable()
export class StoreContextMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Priority 1: Get store ID from headers
      let storeId = req.headers['storeid'] as string || req.headers['store-id'] as string;
      
      if (storeId) {
        req.storeId = storeId;
        console.log(`Store ID set from header: ${storeId}`);
      } else {
        // Priority 2: Extract store ID from JWT token
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
          try {
            const payload = this.jwtService.verify(token);
            if (payload.store) {
              const decryptedStoreId = decryptStoreId(payload.store);
              if (decryptedStoreId) {
                req.storeId = decryptedStoreId;
                console.log(`Store ID set from JWT token: ${decryptedStoreId}`);
              }
            }
          } catch (jwtError) {
            console.log('JWT verification failed or no store ID in token');
          }
        }
        
        // Priority 3: If no store ID from header or token, fallback to main store
        // This will be handled by the StoreContext when requireStoreId() is called
        if (!req.storeId) {
          console.log('No store ID provided in headers or token');
        }
      }
      
      next();
    } catch (error) {
      console.error("StoreContextMiddleware error:", error.message);
      next();
    }
  }
}