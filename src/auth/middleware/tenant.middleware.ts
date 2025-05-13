import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
    constructor(private jwtService: JwtService) { }

    use(req: Request, res: Response, next: NextFunction) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) throw new UnauthorizedException();

        const payload = this.jwtService.verify(token);
        if (!payload.tenantId) {
            throw new UnauthorizedException('Tenant context required');
        }

        req['tenantId'] = this.decryptTenantId(payload.tenantId);
        next();
    }

    private decryptTenantId(encrypted: string): string {
        // Implement with AES or other encryption lib
        return encrypted; // placeholder
    }
}
