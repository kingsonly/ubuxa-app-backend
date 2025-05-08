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

  // async validate(payload: { sub: string }) {
  //   const user = await this.prisma.user.findUnique({
  //     where: {
  //       id: payload.sub,
  //     },
  //     include: {
  //       role: true
  //     }
  //   });

  //   if (!user) {
  //     throw new UnauthorizedException();
  //   }
  //   return user;
  // }
  async validate(payload: { sub: string, tenantId?: string }) {
  const user = await this.prisma.user.findUnique({
    where: {
      id: payload.sub,
    },
    include: {
      role: true,
      tenant: true,
    }
  });

  if (!user) {
    throw new UnauthorizedException();
  }

  // Attach tenant ID to request user object
  return { ...user, tenantId: payload.tenantId };
}
}
