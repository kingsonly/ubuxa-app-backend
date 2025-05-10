
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
       // Remove the /api/v1 prefix for path checks
       const path = req.path.replace(/^\/api\/v1/, '');

       // Routes that should skip tenant checks
       const skipRoutes = [
         '/auth', // All auth routes
         '/login', // Login route
         '/register', // Registration route
         '/change-password',
         '/forgot-password',
         '/reset-password',
         '/admin', // Admin routes
         '/tenants',
         '/administrator',
         '/health', // Health checks
       ];

       // Check if current path should skip tenant verification
       const shouldSkip = skipRoutes.some(route =>
         path.startsWith(route) || // Starts with any skip route
         path === route || // Exact match
         route.startsWith(path) // Route starts with our path
       );

       if (shouldSkip) {
         return next();
       }


    const tenantId = req.headers['x-tenant'] as string;

    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant ID is required' });
    }

    try {
      // Verify tenant exists and is active
      const tenant = await this.prisma.bypassTenant(() =>
        this.prisma.tenant.findUnique({
          where: { id: tenantId, status: 'ACTIVE' },
        })
      );

      if (!tenant) {
        return res.status(404).json({ message: 'Tenant not found or inactive' });
      }

      // Add tenant info to request object
      req['tenantId'] = tenantId;

      // Set current tenant in PrismaService
      this.prisma.setCurrentTenant(tenantId);

      // If the user is authenticated, verify they belong to this tenant
      if (req.user) {
        const userHasAccess = await this.prisma.userTenant.findFirst({
          where: {
            userId: req.user['id'],
            tenantId: tenantId
          }
        });

        if (!userHasAccess) {
          return res.status(403).json({ message: 'User does not have access to this tenant' });
        }
      }

      next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}