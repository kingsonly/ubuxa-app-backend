import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenType, UserStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import * as argon from 'argon2';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../utils/helpers.util';
import { CreateUserDto } from './dto/create-user.dto';
import { EmailService } from '../mailer/email.service';
import { ForgotPasswordDTO } from './dto/forgot-password.dto';
import { MESSAGES } from '../constants';
import { PasswordResetDTO } from './dto/password-reset.dto';
import { LoginUserDTO } from './dto/login-user.dto';
import { CreateSuperUserDto } from './dto/create-super-user.dto';
import { CreateUserPasswordDto, CreateUserPasswordParamsDto } from './dto/create-user-password.dto';
import { generateRandomPassword } from '../utils/generate-pwd';
import { plainToInstance } from 'class-transformer';
import { UserEntity } from '../users/entity/user.entity';
import { ChangePasswordDto } from './dto/change-password.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly Email: EmailService,
    private readonly config: ConfigService,
    private jwtService: JwtService,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  async addUser(userData: CreateUserDto) {
    const { email, firstname, lastname, location, phone, role: roleId } = userData;
    const tenantId = this.request['tenantId'];

    if (!tenantId) throw new BadRequestException('Tenant ID is required');

    // Validate role exists in tenant
    const roleExists = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId }
    });
    if (!roleExists) throw new BadRequestException(MESSAGES.customInvalidMsg('role'));

    // Check global email uniqueness
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const newPwd = generateRandomPassword(30);
      user = await this.prisma.user.create({
        data: {
          firstname,
          lastname,
          location,
          phone,
          email,
          password: await hashPassword(newPwd),
          status: UserStatus.inactive,
        }
      });
    }

    // Check existing tenant membership
    const existingMembership = await this.prisma.userTenant.findFirst({
      where: { userId: user.id, tenantId }
    });
    if (existingMembership) throw new BadRequestException(MESSAGES.TENANT_USER_ALREADY_MEMBER);

    // Create tenant membership
    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId,
        roleId
      }
    });

    // Send onboarding email (same as before)
    const resetToken = uuidv4();
    await this.prisma.tempToken.create({
      data: {
        token: resetToken,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        token_type: TokenType.email_verification,
        userId: user.id,
      }
    });

    const clientUrl = this.config.get<string>('CLIENT_URL');
    const createPasswordUrl = `${clientUrl}create-password/${user.id}/${resetToken}/`;

    await this.Email.sendMail({
      to: email,
      subject: `Welcome to ${this.config.get('APP_NAME')}!`,
      template: './new-user-onboarding',
      context: {
        firstname,
        createPasswordUrl,
        supportEmail: this.config.get('MAIL_FROM')
      }
    });

    return plainToInstance(UserEntity, user);
  }

  async createSuperuser(userData: CreateSuperUserDto) {
    const { email, firstname, lastname, password, cKey, tenantId } = userData;
    if (cKey !== this.config.get('SUPERUSER_KEY')) throw new ForbiddenException();

    // Validate tenant exists
    const tenantExists = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenantExists) throw new BadRequestException(MESSAGES.INVALID_TENANT);

    // Create or get admin role
    const adminRole = await this.prisma.role.upsert({
      where: { tenantId_role: { tenantId, role: 'admin' } },
      create: { role: 'admin', tenantId },
      update: {}
    });

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        firstname,
        lastname,
        password: await hashPassword(password),
        status: UserStatus.active,
      }
    });

    // Create tenant membership
    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId,
        roleId: adminRole.id
      }
    });

    return plainToInstance(UserEntity, user);
  }

  async login(data: LoginUserDTO, res: Response) {
    const { email, password } = data;
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            tenant: true,
            role: { include: { permissions: true } }
          }
        }
      }
    });

    if (!user || !(await argon.verify(user.password, password))) {
      throw new BadRequestException(MESSAGES.INVALID_CREDENTIALS);
    }

    const userToReturn = plainToInstance(UserEntity, user);
    const tenants = user.memberships.map(m => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.companyName,
      role: m.role
    }));

    // Auto-login if single tenant
    if (tenants.length === 1) {
      const { tenantId, role } = tenants[0];
      const token = this.jwtService.sign({ sub: user.id, tenantId });
      res.setHeader('access_token', token);
      res.setHeader('x_tenant', tenantId);
      res.setHeader('Access-Control-Expose-Headers', 'access_token,x_tenant');
      return { ...userToReturn, tenantId, role };
    }

    // Multi-tenant response
    const token = this.jwtService.sign({ sub: user.id });
    res.setHeader('access_token', token);
    res.setHeader('Access-Control-Expose-Headers', 'access_token');
    return { ...userToReturn, tenants };
  }

  async selectTenant(userId: string, tenantId: string, res: Response) {
    const membership = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { role: true, tenant: true }
    });

    if (!membership) throw new ForbiddenException(MESSAGES.TENANT_VALIDATION_FAILED);

    const token = this.jwtService.sign({ sub: userId, tenantId });
    res.setHeader('access_token', token);
    res.setHeader('x_tenant', tenantId);
    res.setHeader('Access-Control-Expose-Headers', 'access_token, x_tenant');
    return {
      tenantId: membership.tenantId,
      tenantName: membership.tenant.companyName,
      role: membership.role
    };
  }

  async getUserTenants(userId: string) {
    const userTenants = await this.prisma.userTenant.findMany({
      where: { userId },
      include: {
        tenant: true,
        role: true,
      },
    });

    return userTenants.map((ut) => ({
      tenantId: ut.tenantId,
      tenantName: ut.tenant.companyName,
      roleId: ut.roleId,
      roleName: ut.role.role,
    }));
  }
  async forgotPassword(forgotPasswordDetails: ForgotPasswordDTO) {
    const { email } = forgotPasswordDetails;

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!existingUser) {
      throw new BadRequestException(MESSAGES.USER_NOT_FOUND);
    }

    let existingToken = await this.prisma.tempToken.findFirst({
      where: {
        token_type: TokenType.password_reset,
        token: {
          not: null,
        },
        userId: existingUser.id,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    const resetToken = uuidv4();
    const newExpirationTime = new Date();
    newExpirationTime.setHours(newExpirationTime.getHours() + 1);

    if (existingToken) {
      await this.prisma.tempToken.update({
        where: { id: existingToken.id },
        data: {
          token: resetToken,
          expiresAt: newExpirationTime,
        },
      });
    } else {
      existingToken = await this.prisma.tempToken.create({
        data: {
          token: resetToken,
          expiresAt: newExpirationTime,
          token_type: TokenType.password_reset,
          userId: existingUser.id,
        },
      });
    }

    const platformName = 'Ubuxa';
    const clientUrl = this.config.get<string>('CLIENT_URL');
    // const resetLink = `${clentUrl}/resetPassword`;
    const resetLink = `${clientUrl}resetPassword/${existingUser.id}/${existingToken.token}/`;

    await this.Email.sendMail({
      to: email,
      from: this.config.get<string>('MAIL_FROM'),
      subject: `Reset Your Password - ${platformName}`,
      template: './reset-password',
      context: {
        firstname: existingUser.firstname,
        resetLink,
        platformName,
        supportEmail: this.config.get<string>('MAIL_FROM'),
      },
    });

    return {
      message: MESSAGES.PWD_RESET_MAIL_SENT,
    };
  }

  async resetPassword(resetPasswordDetails: PasswordResetDTO) {
    const { newPassword, resetToken, userid } = resetPasswordDetails;

    const tokenValid = await this.verifyToken(
      resetToken,
      TokenType.password_reset,
      userid,
    );

    const hashedPwd = await hashPassword(newPassword);

    await this.prisma.user.update({
      where: {
        id: tokenValid.userId,
      },
      data: {
        password: hashedPwd,
      },
    });

    await this.prisma.tempToken.update({
      where: {
        id: tokenValid.id,
      },
      data: {
        token: null,
        expiresAt: new Date('2000-01-01T00:00:00Z'),
      },
    });

    return {
      message: MESSAGES.PWD_RESET_SUCCESS,
    };
  }

  // async verifyResetToken(resetToken: string) {
  //   await this.verifyToken(resetToken);

  //   return { message: MESSAGES.TOKEN_VALID };
  // }

  async createUserPassword(
    pwds: CreateUserPasswordDto,
    params: CreateUserPasswordParamsDto,
  ) {
    const tokenValid = await this.verifyToken(
      params.token,
      TokenType.email_verification,
      params.userid,
    );

    const hashedPwd = await hashPassword(pwds.password);

    await this.prisma.user.update({
      where: {
        id: tokenValid.userId,
      },
      data: {
        password: hashedPwd,
        status: UserStatus.active,
      },
    });

    await this.prisma.tempToken.update({
      where: {
        id: tokenValid.id,
      },
      data: {
        token: null,
        expiresAt: new Date('2000-01-01T00:00:00Z'),
      },
    });

    return {
      message: MESSAGES.PWD_CREATION_SUCCESS,
    };
  }

  async changePassword(pwds: ChangePasswordDto, userId: string) {
    const authUser = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    include: {
        memberships: {
          include: {
            tenant: true,
            role: { include: { permissions: true } }
          }
        }
      }


    });

    const { password, oldPassword } = pwds;

    const verifyPassword = await argon.verify(authUser.password, oldPassword);

    if (!verifyPassword)
      throw new BadRequestException(MESSAGES.INVALID_CREDENTIALS);

    const isNewPwdSameAsOld = await argon.verify(authUser.password, password);

    if (isNewPwdSameAsOld)
      throw new BadRequestException(MESSAGES.PWD_SIMILAR_TO_OLD);

    const hashedPwd = await hashPassword(password);

    await this.prisma.user.update({
      where: {
        id: authUser.id,
      },
      data: {
        password: hashedPwd,
      },
    });

    return {
      message: MESSAGES.PASSWORD_CHANGED_SUCCESS,
    };
  }

  async verifyToken(
    token: string,
    token_type: TokenType = TokenType.email_verification,
    userId?: string,
  ) {
    const tokenValid = await this.prisma.tempToken.findFirst({
      where: {
        token_type,
        token,
        ...(userId && { userId }),
        expiresAt: {
          gte: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!tokenValid) {
      throw new BadRequestException(MESSAGES.INVALID_TOKEN);
    }

    return tokenValid;
  }
}
