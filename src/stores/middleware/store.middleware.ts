import type { Request, Response, NextFunction } from "express";
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import { decryptStoreId } from 'src/utils/encryptor.decryptor';

const prisma = new PrismaClient();

/**
 * Functional middleware for store context
 * Priority: Header > JWT Token > Main Store (handled by StoreContext)
 */
export function storeMiddleware(req: Request, res: Response, next: NextFunction) {
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
                    const payload = jwt.verify(token, process.env.JWT_SECRET_KEY) as any;
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
        console.error("StoreMiddleware error:", error.message);
        next();
    }
}

/**
 * Helper function to get main store for a tenant
 */
export async function getMainStoreForTenant(tenantId: string): Promise<string | null> {
    try {
        const mainStore = await prisma.store.findFirst({
            where: {
                tenantId,
                type: 'MAIN',
                isActive: true
            },
            select: { id: true }
        });
        
        return mainStore?.id || null;
    } catch (error) {
        console.error('Error getting main store:', error);
        return null;
    }
}

/**
 * Extracts store ID from JWT token
 */
export function extractStoreIdFromToken(token: string): string | null {
    try {
        if (!token) return null;

        const payload = jwt.verify(token, process.env.JWT_SECRET_KEY) as any;
        
        if (!payload || typeof payload !== "object" || !payload.store) {
            return null;
        }
        
        return decryptStoreId(payload.store);
    } catch (error) {
        console.error("JWT verification error for store:", error.message);
        return null;
    }
}