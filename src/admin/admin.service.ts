import { Injectable, UnauthorizedException, UseGuards, Get, Req, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { hashPassword } from 'src/utils/helpers.util';
import { ConfigService } from '@nestjs/config';
import * as argon from 'argon2';

@Injectable()
export class AdminService {
    constructor(
        private prisma: PrismaService,
        private readonly config: ConfigService,
        private jwtService: JwtService,
    ) { }

    async validateAdmin(email: string, password: string) {
        const admin = await this.prisma.admin.findUnique({ where: { email } });
        if (!admin || !(await argon.verify(admin.password, password))) {
            throw new UnauthorizedException('Invalid credentials');
        }
        const { password: _, ...result } = admin;
        return result;
    }

    async login(admin: { email: string }) {
        const foundAdmin = await this.prisma.admin.findUnique({ where: { email: admin.email } });
        const payload = { sub: foundAdmin.id, role: 'admin', email: foundAdmin.email };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }

    @UseGuards(AdminAuthGuard)
    @Get('dashboard')
    getProtectedData(@Req() req) {
        return { message: 'Admin Access Granted', adminId: req.admin.sub };
    }

    async createSuperAdmin(adminData: CreateSuperAdminDto) {
        const { email, password, cKey } = adminData;

        const adminCreationToken = '09yu2408h0wnh89h20';

        if (adminCreationToken !== cKey) {
            throw new ForbiddenException();
        }

        const emailExists = await this.prisma.admin.findFirst({
            where: {
                email,
            },
        });

        if (emailExists) {
            throw new BadRequestException("email Exists");
        }

        const hashedPwd = await hashPassword(password);

        const newAdmin = await this.prisma.admin.create({
            data: {
                email,
                password: hashedPwd,
            },
        });

        return newAdmin;
    }
}
