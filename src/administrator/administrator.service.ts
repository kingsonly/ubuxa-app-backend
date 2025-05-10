
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { TokenType, TenantStatus, UserStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
// import { generateRandomPassword } from '../utils/generate-pwd';
import { plainToInstance } from 'class-transformer';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto/create-tenant-admin.dto';
import { CreateTenantDto } from './dto/create-tenant.dto/create-tenant.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/mailer/email.service';
import { hashPassword } from 'src/utils/helpers.util';
import { UserEntity } from 'src/users/entity/user.entity';

@Injectable()
export class AdministratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly Email: EmailService,


  ) {}
  async createTenant(createTenantDto: CreateTenantDto) {
    const {
      email,
      companyName,
      firstName,
      lastName,
      phone,
      domain,
      logoUrl,
      faviconUrl,
      theme,
      interest,
    moreInfo,
      cKey,
      } = createTenantDto;

       if (cKey !== this.config.get('SUPERUSER_KEY')) throw new ForbiddenException();

    // Check if tenant with same email or domain already exists
    const existingTenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { email },
          ...(domain ? [{ domain }] : [])
        ]
      }
    });

    if (existingTenant) {
      throw new BadRequestException(
        existingTenant.email === email
          ? 'A tenant with this email already exists'
          : 'A tenant with this domain already exists'
      );
    }

    // Create the tenant
    const tenant = await this.prisma.tenant.create({
      data: {
        email,
        companyName,
        firstName,
        lastName,
        phone,
        domain,
        logoUrl,
        faviconUrl,
        theme,
        interest,
        moreInfo,
        status: TenantStatus.PENDING,
      }
    });

    // Create default admin role for this tenant
    const adminRole = await this.prisma.role.create({
      data: {
        role: 'admin',
        tenantId: tenant.id,
        active: true,
      }
    });

    // Create default permissions for admin role
    await this.prisma.permission.create({
      data: {
        action: 'manage',
        subject: 'all',
        roles: {
          connect: { id: adminRole.id }
        }
      }
    });

    return {
      tenant,
      adminRole,
      message: `Tenant ${companyName} created successfully with ID: ${tenant.id}`
    };
  }

  async createTenantAdmin(tenantId: string, adminData: CreateTenantAdminDto) {
    const { email, firstname, lastname, phone, location, cKey, password } = adminData;

       if (cKey !== this.config.get('SUPERUSER_KEY')) throw new ForbiddenException();

    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    // Find admin role
    const adminRole = await this.prisma.role.findFirst({
      where: {
        tenantId,
        role: 'admin'
      }
    });

    if (!adminRole) {
      throw new BadRequestException('Admin role not found for this tenant');
    }

    // Check if user already exists
    let user = await this.prisma.user.findUnique({
      where: { email }
    });

    // If user doesn't exist, create a new one
    if (!user) {
      // const newPwd = generateRandomPassword(30);
      user = await this.prisma.user.create({
        data: {
          firstname,
          lastname,
          location,
          phone,
          email,
          password: await hashPassword(password),
          status: UserStatus.inactive,
        }
      });
    }

    // Check if user is already a member of this tenant
    const existingMembership = await this.prisma.userTenant.findFirst({
      where: {
        userId: user.id,
        tenantId
      }
    });

    if (existingMembership) {
      throw new BadRequestException('User is already a member of this tenant');
    }

    // Create tenant membership with admin role
    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId,
        roleId: adminRole.id
      }
    });

    // Generate verification token for password setup
    const resetToken = uuidv4();
    await this.prisma.tempToken.create({
      data: {
        token: resetToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        token_type: TokenType.email_verification,
        userId: user.id,
      }
    });

    // Send invitation email
    const clientUrl = this.config.get<string>('CLIENT_URL');
    const createPasswordUrl = `${clientUrl}create-password/${user.id}/${resetToken}/`;

    await this.Email.sendMail({
      to: email,
      subject: `Admin Access for ${tenant.companyName}`,
      template: './new-admin-invitation',
      context: {
        firstname,
        tenantName: tenant.companyName,
        createPasswordUrl,
        supportEmail: this.config.get('MAIL_FROM')
      }
    });

    return plainToInstance(UserEntity, user);
  }

  // Additional tenant management methods can go here
  async findAllTenants() {
    return this.prisma.tenant.findMany();
  }

  async findTenantById(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id }
    });
  }

  async updateTenant(id: string, updateData: any) {
    return this.prisma.tenant.update({
      where: { id },
      data: updateData
    });
  }

  async deleteTenant(id: string) {
    // First delete all user-tenant connections
    await this.prisma.userTenant.deleteMany({
      where: { tenantId: id }
    });

    // Then delete tenant roles
    await this.prisma.role.deleteMany({
      where: { tenantId: id }
    });

    // Finally delete the tenant
    return this.prisma.tenant.delete({
      where: { id }
    });
  }
}