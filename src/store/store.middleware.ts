import type { Request, Response, NextFunction } from "express"
import { extractStoreIdFromToken, extractUserIdFromToken, shouldSkipStoreCheck } from "./store.utils"


/**
 * Functional middleware for store context
 */
export function storeMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        // Get the original URL (includes the global prefix)
        const fullPath = req.originalUrl || req.url

        // Log the path for debugging
        console.log(`Store middleware processing path: ${fullPath}`)

        // Skip middleware for paths that don't require store context
        if (shouldSkipStoreCheck(fullPath)) {
            console.log(`Skipping store check for path: ${fullPath}`)
            return next()
        }

        const token = req.headers.authorization?.split(" ")[1]
        if (!token) {
            console.log(`No token provided for store context. Path: ${fullPath}`);
            return next() // Let tenant middleware handle auth errors
        }

        // Extract store ID from JWT token
        const storeId = extractStoreIdFromToken(token)
        
        if (storeId) {
            console.log(`Store ID extracted: ${storeId} for path: ${fullPath}`)
            req["storeId"] = storeId;
            req.headers['storeid'] = storeId;
            console.log(`Store ID set: ${req["storeId"]} for path: ${fullPath}`)
        } else {
            // Fallback to user's assigned store if no store in token
            console.log(`No store ID found in token, attempting fallback for path: ${fullPath}`)
            const userId = extractUserIdFromToken(token)
            
            if (userId) {
                // TODO: Implement getUserDefaultStore function when StoreService is available
                // For now, we'll let the request continue without store context
                // The StoreService will handle the fallback logic
                console.log(`User ID extracted for store fallback: ${userId}`)
            }
        }

        next()
    } catch (error) {
        console.error("StoreMiddleware error:", error.message)
        // Don't throw an exception here, let the request continue
        // and let the guards handle authentication if needed
        next()
    }
}