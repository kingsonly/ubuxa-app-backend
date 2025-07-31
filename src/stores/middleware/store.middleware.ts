import type { Request, Response, NextFunction } from "express";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Functional middleware for store context
 * If no store ID is provided, it will try to use the main store for the tenant
 */
export function storeMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        // Get store ID from headers
        const storeId = req.headers['storeid'] as string || req.headers['store-id'] as string;
        
        if (storeId) {
            req.storeId = storeId;
            console.log(`Store ID set from header: ${storeId}`);
        } else {
            // If no store ID provided, we'll try to set the main store later
            // This will be handled by the StoreContext when requireStoreId() is called
            console.log('No store ID provided in headers');
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