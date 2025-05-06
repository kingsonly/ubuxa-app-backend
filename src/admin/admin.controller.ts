import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';
import { AdminAuthGuard } from './guards/admin-auth.guard';

@Controller('admin')
export class AdminController {
    constructor(private adminService: AdminService) { }

    @Post('login')
    async login(@Body() body: { email: string; password: string }) {
        const admin = await this.adminService.validateAdmin(body.email, body.password);
        return this.adminService.login(admin);
    }


    @Post('create-super-admin')
    // @ApiExcludeEndpoint()
    async createSuperuser(@Body() registerUserDto: CreateSuperAdminDto) {
        const newAdmin = await this.adminService.createSuperAdmin(registerUserDto);
        return newAdmin;

    }

    @UseGuards(AdminAuthGuard)
    @Get('dashboard')
    adminDashboard(@Req() req) {
        return { message: 'Admin Access Granted', adminId: req.admin };
    }
}
