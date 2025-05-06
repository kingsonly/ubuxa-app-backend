import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AdminAuthGuard implements CanActivate {
    constructor(private jwtService: JwtService) { }

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const request = ctx.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new UnauthorizedException();
        }

        const token = authHeader.split(' ')[1];
        try {
            const payload = this.jwtService.verify(token);
            if (payload.role !== 'admin') throw new UnauthorizedException();
            request.admin = payload;
            return true;
        } catch {
            throw new UnauthorizedException();
        }
    }
}
