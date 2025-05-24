import * as jwt from "jsonwebtoken"
import * as crypto from "crypto"
import * as dotenv from 'dotenv';
dotenv.config();

// Constants
const JWT_SECRET = process.env.JWT_SECRET_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
const IV_LENGTH = 16
const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex'); // Make sure this is 32 byte



export function decryptTenantId(text: string): string {
    try {
        const [iv, encrypted] = text.split(':');
        const ivBuffer = Buffer.from(iv, 'hex');
        const encryptedText = Buffer.from(encrypted, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, ivBuffer);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        console.log("✅ Decrypted string:", decrypted.toString());
        return decrypted.toString();
    } catch (err) {
        console.error('❌ Decryption error:', err.message);
        return null;
    }
}

/**
 * Extracts tenant ID from JWT token
 */
export function extractTenantIdFromToken(token: string): string | null {
    try {
        if (!token) return null

        const payload = jwt.verify(token, JWT_SECRET)


        if (!payload || typeof payload !== "object" || !payload.tenant) {
            return null
        }
        console.log(`i am the decryption :`, payload.tenant)
        return decryptTenantId(payload.tenant)
    } catch (error) {
        console.error("JWT verification error:", error.message)
        return null
    }
}

/**
 * Checks if a path should skip tenant verification
 */
export function shouldSkipTenantCheck(path: string): boolean {
    const excludedPaths = [
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/admin",
        "/api/v1/auth/create-superuser",
        "/api/v1/tenants/onboard-company-agreed-amount",
        "/api/v1/tenants/onboard-initial-payment",
        "/api/v1/tenants",
        "/api/v1/auth/select-tenant",
        "/health",
        "/docs",
    ]

    return excludedPaths.some((excluded) => path.startsWith(excluded))
}
