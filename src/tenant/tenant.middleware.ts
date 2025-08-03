import type { Request, Response, NextFunction } from 'express';
import {
  extractTenantIdFromToken,
  shouldSkipTenantCheck,
} from 'src/utils/universal-token-url.utils';

/**
 * Functional middleware for tenant context
 */
export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Get the original URL (includes the global prefix)
    const fullPath = req.originalUrl || req.url;

    // Log the path for debugging
    console.log(
      `Tenant middleware processing path: ${shouldSkipTenantCheck(fullPath)}`,
    );

    // Skip middleware for paths that don't require tenant context
    if (shouldSkipTenantCheck(fullPath)) {
      console.log(`Skipping tenant check for path: ${fullPath}`);
      return next();
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log(`No token provided. Blocking access to path: ${fullPath}`);
      return res
        .status(401)
        .json({ message: 'Unauthorized: Token is required' });
    }

    const tenantId = extractTenantIdFromToken(token);
    console.log(`Tenant ID extracted: ${tenantId} for path: ${tenantId}`);
    if (tenantId) {
      console.log(`Tenant ID extracted: ${tenantId} for path: ${fullPath}`);
      req['tenantId'] = tenantId;
      // Optionally, you can set the tenantId in headers for downstream services
      // This is optional, depending on your use case
      req.headers['tenantid'] = tenantId;
      console.log(
        `Tenant ID set: ${req['tenantId']} for path: ${fullPath}`,
        req,
      );
    } else {
      console.log(`No tenant ID found in token for path: ${token}`);
    }

    next();
  } catch (error) {
    console.error('TenantMiddleware error:', error.message);
    // Don't throw an exception here, let the request continue
    // and let the guards handle authentication if needed
    next();
  }
}
