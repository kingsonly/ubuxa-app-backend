import * as jwt from "jsonwebtoken"
import * as dotenv from 'dotenv';
import { decryptStoreId } from '../utils/encryptor.decryptor';
dotenv.config();

// Constants
const JWT_SECRET = process.env.JWT_SECRET_KEY

/**
 * Extracts store ID from JWT token
 */
export function extractStoreIdFromToken(token: string): string | null {
    try {
        if (!token) return null

        const payload = jwt.verify(token, JWT_SECRET)

        if (!payload || typeof payload !== "object" || !payload.store) {
            return null
        }
        
        console.log(`Store extraction from token:`, payload.store)
        return decryptStoreId(payload.store)
    } catch (error) {
        console.error("Store JWT verification error:", error.message)
        return null
    }
}

/**
 * Extracts user ID from JWT token (for fallback store assignment)
 */
export function extractUserIdFromToken(token: string): string | null {
    try {
        if (!token) return null

        const payload = jwt.verify(token, JWT_SECRET)

        if (!payload || typeof payload !== "object" || !payload.sub) {
            return null
        }
        
        return payload.sub as string
    } catch (error) {
        console.error("User JWT verification error:", error.message)
        return null
    }
}

/**
 * Checks if a path should skip store verification
 */
export function shouldSkipStoreCheck(path: string): boolean {
    const excludedPaths = [
        "/api/v1/auth/login",
        "/api/v1/auth/register", 
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/admin",
        "/api/v1/auth/create-superuser",
        "/api/v1/tenants",
        "/api/v1/auth/select-tenant",
        "/api/v1/auth/select-store", // New endpoint for store selection
        "/health",
        "/docs",
    ]
    
    return excludedPaths.some((excluded) => path.startsWith(excluded))
}