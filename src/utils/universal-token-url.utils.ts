import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

// Constants
const JWT_SECRET = process.env.JWT_SECRET_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
// const IV_LENGTH = 16;
const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex'); // Make sure this is 32 byte

// Types
export type EntityType = 'store' | 'tenant';

interface PathConfig {
  store: string[];
  tenant: string[];
}

// Configuration for excluded paths
const EXCLUDED_PATHS: PathConfig = {
  store: [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/admin',
    '/api/v1/auth/create-superuser',
    '/api/v1/tenants',
    '/api/v1/auth/select-tenant',
    '/api/v1/auth/select-store',
    '/api/v1/tenants/onboard-company-agreed-amount',
    '/api/v1/tenants/onboard-initial-payment',
    '/health',
    '/docs',
  ],
  tenant: [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/admin',
    '/api/v1/auth/create-superuser',
    '/api/v1/tenants/onboard-company-agreed-amount',
    '/api/v1/tenants/onboard-initial-payment',
    '/api/v1/tenants',
    '/api/v1/auth/select-tenant',
    '/health',
    '/docs',
  ],
};

/**
 * Generic decryption function
 */
function decryptId(text: string, entityType: EntityType): string | null {
  try {
    const [iv, encrypted] = text.split(':');
    const ivBuffer = Buffer.from(iv, 'hex');
    const encryptedText = Buffer.from(encrypted, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      keyBuffer,
      ivBuffer,
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    console.log(`✅ Decrypted ${entityType} ID:`, decrypted.toString());
    return decrypted.toString();
  } catch (err) {
    console.error(`❌ ${entityType} decryption error:`, err.message);
    return null;
  }
}

/**
 * Generic function to extract entity ID from JWT token
 */
function extractEntityIdFromToken(
  token: string,
  entityType: EntityType,
): string | null {
  try {
    if (!token) return null;

    const payload = jwt.verify(token, JWT_SECRET) as any;

    if (!payload || typeof payload !== 'object' || !payload[entityType]) {
      return null;
    }

    console.log(`${entityType} extraction from token:`, payload[entityType]);
    return decryptId(payload[entityType], entityType);
  } catch (error) {
    console.error(`${entityType} JWT verification error:`, error.message);
    return null;
  }
}

/**
 * Generic function to check if a path should skip verification
 */
function shouldSkipCheck(path: string, entityType: EntityType): boolean {
  const excludedPaths = EXCLUDED_PATHS[entityType];
  return excludedPaths.some((excluded) => path.startsWith(excluded));
}

/**
 * Extracts user ID from JWT token (for fallback assignments)
 */
function extractUserIdFromToken(token: string): string | null {
  try {
    if (!token) return null;

    const payload = jwt.verify(token, JWT_SECRET) as any;

    if (!payload || typeof payload !== 'object' || !payload.sub) {
      return null;
    }

    return payload.sub as string;
  } catch (error) {
    console.error('User JWT verification error:', error.message);
    return null;
  }
}

// Exported convenience functions
export const extractStoreIdFromToken = (token: string) =>
  extractEntityIdFromToken(token, 'store');
export const extractTenantIdFromToken = (token: string) =>
  extractEntityIdFromToken(token, 'tenant');
export const shouldSkipStoreCheck = (path: string) =>
  shouldSkipCheck(path, 'store');
export const shouldSkipTenantCheck = (path: string) =>
  shouldSkipCheck(path, 'tenant');

// Export the generic functions for potential future use
export {
  extractEntityIdFromToken,
  shouldSkipCheck,
  extractUserIdFromToken,
  decryptId,
};

// Legacy exports for backward compatibility (if needed)
export function decryptStoreId(text: string): string | null {
  return decryptId(text, 'store');
}

export function decryptTenantId(text: string): string | null {
  return decryptId(text, 'tenant');
}
