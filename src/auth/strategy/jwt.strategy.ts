import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
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
    // Get basic user without relations
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: true } // Include memberships for tenant verification
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Initialize auth user object
    const authUser: any = {
      ...user,
      tenantId: payload.tenantId || null,
      tenantRole: null
    };

    // Handle tenant context if present
    if (payload.tenantId) {
      const membership = await this.prisma.userTenant.findFirst({
        where: {
          userId: user.id,
          tenantId: payload.tenantId
        },
        include: {
          role: {
            include: {
              permissions: true // Include permissions if needed for authorization
            }
          }
        }
      });

      if (!membership) {
        throw new UnauthorizedException('User not member of this tenant');
      }

      // Attach tenant-specific role and permissions
      authUser.tenantRole = membership.role;
      authUser.permissions = membership.role.permissions;
    }

    return authUser;
  }
}