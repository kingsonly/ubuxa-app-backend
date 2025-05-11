import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../src/prisma/prisma.service';


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {

  private readonly logger = new Logger(JwtStrategy.name);
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET_KEY'),
    });
  }

  async validate(payload: { sub: string; tenantId?: string }) {
    // Set tenant context immediately if available
    if (payload.tenantId) {
      this.logger.warn(`jwt logger: ${payload.tenantId}`);
      this.prisma.setCurrentTenant(payload.tenantId);

    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: true }
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const authUser: any = {
      ...user,
      tenantId: payload.tenantId || null,
    };

    if (payload.tenantId) {
      const membership = await this.prisma.userTenant.findFirst({
        where: {
          userId: user.id,
          tenantId: payload.tenantId
        },
        include: { role: true }
      });

      if (!membership) {
        throw new UnauthorizedException('User not member of this tenant');
      }

      authUser.tenantRole = membership.role;
    }
// console.warn(authUser, "user")
    return authUser;
  }
}

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
//   constructor(
//     config: ConfigService,
//     private readonly prisma: PrismaService,
//   ) {
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       ignoreExpiration: false,
//       secretOrKey: config.get('JWT_SECRET_KEY'),
//     });
//   }

//   async validate(payload: { sub: string; tenantId?: string }) {


//     if (payload.tenantId) {
//       // Validate tenant exists and is active
//       console.warn(payload.tenantId+ "jwt")
//       const tenantExists = await this.prisma.validateTenant(payload.tenantId);
//       if (!tenantExists) {
//         throw new UnauthorizedException('Invalid tenant');
//       }

//       // Set current tenant in Prisma context
//       this.prisma.setCurrentTenant(payload.tenantId);
//     }

//     // Get basic user without relations
//     const user = await this.prisma.user.findUnique({
//       where: { id: payload.sub },
//       include: { memberships: true } // Include memberships for tenant verification
//     });

//     console.warn("jwt next")

//     if (!user) {
//       throw new UnauthorizedException('User not found');
//     }

//     // Initialize auth user object
//     const authUser: any = {
//       ...user,
//       tenantId: payload.tenantId || null,
//       tenantRole: null
//     };

//     // Handle tenant context if present
//     if (payload.tenantId) {
//       const membership = await this.prisma.userTenant.findFirst({
//         where: {
//           userId: user.id,
//           tenantId: payload.tenantId
//         },
//         include: {
//           role: {
//             include: {
//               permissions: true // Include permissions if needed for authorization
//             }
//           }
//         }
//       });

//       if (!membership) {
//         throw new UnauthorizedException('User not member of this tenant');
//       }

//       // Attach tenant-specific role and permissions
//       authUser.tenantRole = membership.role;
//       authUser.permissions = membership.role.permissions;
//     }
//     console.warn("jwt next two")
//     console.warn(authUser +"jwt next two plus user")
//     return authUser;
//   }
// }