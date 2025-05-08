// tenant.middleware.ts
// import { Injectable, NestMiddleware } from '@nestjs/common';
// import { Request, Response, NextFunction } from 'express';
// import { PrismaService } from 'src/prisma/prisma.service';

// @Injectable()
// export class TenantMiddleware implements NestMiddleware {
//   constructor(private readonly prisma: PrismaService) {}

//   async use(req: Request, res: Response, next: NextFunction) {
//     // Remove the /api/v1 prefix for path checks
//     const path = req.path.replace(/^\/api\/v1/, '');

//     // Skip tenant middleware for auth routes
//     const isAuthRoute = path.startsWith('/auth');

//     // Admin routes that bypass tenant filtering
//     const adminRoutes = [
//       '/admin',
//       '/tenants',
//       // Add other admin routes here
//     ];

//     const isAdminRoute = adminRoutes.some(route => path.startsWith(route));

//     if (isAuthRoute || isAdminRoute) {
//       return next();
//     }

//     const tenantId = req.headers['x-tenant'] as string;

//     if (!tenantId) {
//       return res.status(400).json({ message: 'Tenant ID is required' });
//     }

//     try {
//       // Verify tenant exists and is active
//       const tenant = await this.prisma.bypassTenant(() =>
//         this.prisma.tenant.findUnique({
//           where: { id: tenantId, isActive: true },
//         })
//       );

//       if (!tenant) {
//         return res.status(404).json({ message: 'Tenant not found or inactive' });
//       }

//       // Add tenant info to request object
//       req['tenantId'] = tenantId;
//       this.prisma.setCurrentTenant(tenantId);

//       next();
//     } catch (error) {
//       console.error('Tenant middleware error:', error);
//       return res.status(500).json({ message: 'Internal server error' });
//     }
//   }
// }

// tenant.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Remove the /api/v1 prefix for path checks
    const path = req.path.replace(/^\/api\/v1/, '');

    // Skip tenant middleware for auth routes
    const isAuthRoute = path.startsWith('/auth');

    // Admin routes that bypass tenant filtering
    const adminRoutes = [
      '/admin',
      '/tenants',
      // Add other admin routes here
    ];

    const isAdminRoute = adminRoutes.some(route => path.startsWith(route));

    if (isAuthRoute || isAdminRoute) {
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
          where: { id: tenantId, isActive: true },
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