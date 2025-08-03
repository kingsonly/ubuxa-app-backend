import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenType, UserStatus, TenantStatus } from '@prisma/client';
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
import {
  CreateUserPasswordDto,
  CreateUserPasswordParamsDto,
} from './dto/create-user-password.dto';
import { generateRandomPassword } from '../utils/generate-pwd';
import { plainToInstance } from 'class-transformer';
import { UserEntity } from '../users/entity/user.entity';
import { ChangePasswordDto } from './dto/change-password.dto';
import { encryptStoreId, encryptTenantId } from 'src/utils/encryptor.decryptor';
import { TenantContext } from 'src/tenants/context/tenant.context';
import { TenantsService } from 'src/tenants/tenants.service';

interface JWTPayload {
  sub: string;
  tenant: string;
  store?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly Email: EmailService,
    private readonly config: ConfigService,
    private jwtService: JwtService,
    private readonly tenantContext: TenantContext,
    private readonly tenantsService: TenantsService,
  ) {}
  async addUser(
    userData: CreateUserDto,
    // req: Request
  ) {
    const {
      email,
      firstname,
      lastname,
      location,
      phone,
      role: roleId,
    } = userData;
    const tenantId = this.tenantContext.requireTenantId();
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new BadRequestException(MESSAGES.TENANT_NOT_FOUND);
    }

    const emailExists = await this.prisma.user.findFirst({
      where: { email },
    });

    console.log('emailExists', emailExists);
    if (emailExists) {
      throw new BadRequestException(MESSAGES.EMAIL_EXISTS);
    }

    const roleExists = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });

    if (!roleExists) {
      throw new BadRequestException(MESSAGES.customInvalidMsg('role'));
    }

    const newPwd = generateRandomPassword(30);
    const hashedPwd = await hashPassword(newPwd);

    // 1. Create the user
    const user = await this.prisma.user.create({
      data: {
        firstname,
        lastname,
        location,
        phone,
        email,
        password: hashedPwd,
        status: UserStatus.inactive,
      },
    });

    // 2. Create user-tenant-role mapping
    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId,
        roleId,
      },
    });

    // 3. Create email verification token
    const resetToken = uuidv4();
    const expirationTime = new Date();
    expirationTime.setFullYear(expirationTime.getFullYear() + 1);

    const token = await this.prisma.tempToken.create({
      data: {
        token: resetToken,
        expiresAt: expirationTime,
        token_type: TokenType.email_verification,
        userId: user.id,
      },
    });
    // update tenant details based on dto onboarding key

    if (userData.onboarding) {
      await this.tenantsService.update(tenantId, {
        status: TenantStatus.ACTIVE,
      });
    }

    // 4. Send onboarding email
    const clientUrl = this.config.get<string>('CLIENT_URL');
    const createPasswordUrl = `${clientUrl}create-password/${user.id}/${token.token}/`;
    const platformName = tenant.companyName || 'Ubuxa Energy CRM';
    await this.Email.sendMail({
      userId: user.id,
      to: email,
      from: this.config.get<string>('MAIL_FROM'),
      subject: `Welcome to ${platformName} - Let's Get You Started!`,
      template: './new-user-onboarding',
      context: {
        firstname,
        userEmail: email,
        platformName: platformName,
        createPasswordUrl,
        supportEmail: this.config.get<string>('MAIL_FROM'),
      },
    });

    return user;
  }

  async createSuperuser(userData: CreateSuperUserDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const { email, firstname, lastname, password, cKey } = userData;

    const adminCreationToken =
      process.env.ADMIN_CREATION_KEY || '09yu2408h0wnh89h20';
    if (adminCreationToken !== cKey) {
      throw new ForbiddenException('Invalid creation key');
    }

    const emailExists = await this.prisma.user.findUnique({ where: { email } });
    if (emailExists) {
      throw new BadRequestException(MESSAGES.EMAIL_EXISTS);
    }

    const hashedPwd = await hashPassword(password);

    // Step 1: Create or fetch tenant
    const tenant = await this.prisma.tenant.create({
      data: {
        firstName: firstname,
        lastName: lastname,
        email: email,
        companyName: firstname + ' ' + lastname + ' ' + 'LLC',
        phone: '00000000000',
        status: TenantStatus.ACTIVE,
      },
    });

    // Step 2: Create or fetch role
    const role = await this.prisma.role.create({
      data: {
        role: 'admin',
        tenant: { connect: { id: tenantId } },
      },
    });

    // Step 3: Create user
    const user = await this.prisma.user.create({
      data: {
        firstname,
        lastname,
        email,
        password: hashedPwd,
      },
    });

    // Step 4: Create UserTenant link
    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        roleId: role.id,
      },
    });

    return {
      message: 'Superuser created successfully',
      userId: user.id,
      tenantId: tenant.id,
      role: role.role,
    };
  }

  async login(data: LoginUserDTO, res: Response) {
    const { email, password, tenantId } = data;

    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive', // 👈 Makes the search case-insensitive
        },
      },
      // include: {
      //   tenants: {
      //     include: {
      //       tenant: true,
      //       role: {
      //         include: { permissions: true },
      //       },
      //       assignedStore: true, // Include the assigned store
      //     },
      //   },
      // },
      include: {
        tenants: {
          include: {
            tenant: {
              include: {
                stores: true,
              },
            },
            role: {
              include: { permissions: true },
            },

            assignedStore: {
              select: {
                id: true,
                name: true,
                description: true,
                address: true,
                phone: true,
                email: true,
                classification: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new BadRequestException(MESSAGES.INVALID_CREDENTIALS);
    const verifyPassword = await argon.verify(user.password, password);
    if (!verifyPassword)
      throw new BadRequestException(MESSAGES.INVALID_CREDENTIALS);

    const userTenants = user.tenants;

    // Handle case where user has no tenants
    if (userTenants.length === 0) {
      // Option 1: Return a specific error message
      throw new ForbiddenException('You do not have access to any tenants.');
    }

    if (tenantId) {
      const tenantMatch = userTenants.find((ut) => ut.tenantId === tenantId);
      if (!tenantMatch) {
        throw new ForbiddenException('You do not have access to this tenant.');
      }

      const assignedStoreId = tenantMatch.assignedStoreId;
      const encryptedTenant = encryptTenantId(tenantId);

      const payload: JWTPayload = {
        sub: user.id,
        tenant: encryptedTenant,
        ...(assignedStoreId && { store: encryptStoreId(assignedStoreId) }),
      };

      const access_token = this.jwtService.sign(payload);

      res.setHeader('access_token', access_token);
      res.setHeader('Access-Control-Expose-Headers', 'access_token');
      const filteredUser = {
        ...user,
        tenants: userTenants.filter((ut) => ut.tenantId === tenantId),
      };

      return {
        user: plainToInstance(UserEntity, filteredUser),
        access_token,
        hasMultipleTenants: false,

        store: tenantMatch.assignedStore || null,
      };
    }

    if (userTenants.length === 1) {
      const tenantId = userTenants[0].tenantId;
      const assignedStoreId = userTenants[0].assignedStoreId;
      const encryptedTenant = encryptTenantId(tenantId);

      const payload: JWTPayload = {
        sub: user.id,
        tenant: encryptedTenant,
        ...(assignedStoreId && { store: encryptStoreId(assignedStoreId) }),
      };

      const access_token = this.jwtService.sign(payload);

      res.setHeader('access_token', access_token);
      res.setHeader('Access-Control-Expose-Headers', 'access_token');

      return {
        user: plainToInstance(UserEntity, user),
        access_token,
        hasMultipleTenants: false,

        store: userTenants[0].assignedStore || null,
        assignedStore: userTenants[0].assignedStore || null,
      };
    } else {
      const tempToken = this.jwtService.sign({ sub: user.id });
      return {
        message: 'Multiple tenants found. Please select one.',
        tenants: userTenants.map((ut) => ({
          tenantId: ut.tenant.id,
          name: ut.tenant.companyName,
        })),
        hasMultipleTenants: true,
        access_token: tempToken,
      };
    }
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

    const platformName = 'Ubuxa Energy CRM';
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

  async selectTenantLogin(userId: string, tenantId: string, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenants: {
          where: { tenantId }, // ✅ Filter only the selected tenant
          include: {
            tenant: true,
            role: {
              include: { permissions: true },
            },

            assignedStore: {
              select: {
                id: true,
                name: true,
                description: true,
                address: true,
                phone: true,
                email: true,
                classification: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new ForbiddenException('User not found.');
    }

    const userTenant = user.tenants.find((ut) => ut.tenantId === tenantId);
    if (!userTenant) {
      throw new ForbiddenException('You do not have access to this tenant.');
    }

    // Get the assigned store ID from the userTenant (not userTenants)
    const assignedStoreId = userTenant.assignedStoreId;
    const encryptedTenant = encryptTenantId(tenantId);

    const payload: JWTPayload = {
      sub: user.id,
      tenant: encryptedTenant,
      ...(assignedStoreId && { store: encryptStoreId(assignedStoreId) }),
    };

    const access_token = this.jwtService.sign(payload);

    res.setHeader('access_token', access_token);
    res.setHeader('Access-Control-Expose-Headers', 'access_token');

    return {
      user: plainToInstance(UserEntity, user),
      access_token,
      hasMultipleTenants: false,

      store: userTenant.assignedStore || null,
    };
  }
}
