import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantFilterDto } from './dto/tenant-filter.dto';
import { MESSAGES } from 'src/constants';
import { Tenant, TenantStatus, UserStatus } from '@prisma/client';
import { createPaginatedResponse, createPrismaQueryOptions, hashPassword } from 'src/utils/helpers.util';
// import { generateRandomPassword } from 'src/utils/generate-pwd';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { EmailService } from 'src/mailer/email.service';
import { ConfigService } from '@nestjs/config';
import { encryptTenantId } from 'src/utils/encryptor.decryptor';
const tenantSafeSelect = {
    id: true,
    slug: true,
    email: true,
    companyName: true,
    firstName: true,
    lastName: true,
    phone: true,
    theme: true,
    logoUrl: true,
    domainUrl: true,
    subscriptionStatus: true,
    monthlyFee: true,
    paymentProvider: true,
    createdAt: true,
    updatedAt: true,
};
//type TenantSafe = Omit<Tenant, 'providerPrivateKey' | 'providerPublicKey' | 'webhookSecret'>;

type TenantSafe = {
    id: string;
    slug: string | null;
    email: string;
    companyName: string;
    firstName: string;
    lastName: string;
    phone: string;

    paymentProvider: any;
    logoUrl: string | null;
    domainUrl: string | null;
    theme: any;
};
@Injectable()
export class TenantsService {
    constructor(
        private prisma: PrismaService,
        private flutterwaveService: FlutterwaveService,
        private readonly Email: EmailService,
        private readonly config: ConfigService,
    ) { }

    async getTenantSafe(tenantId: string): Promise<TenantSafe | null> {
        return await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: tenantSafeSelect,
        });
    }

    async createTenant(createTenantDto: CreateTenantDto) {
        const existingTenant = await this.prisma.tenant.findFirst({
            where: { email: createTenantDto.email },
        });

        if (existingTenant) {
            throw new BadRequestException(MESSAGES.EMAIL_EXISTS);
        }

        // Generate a slug from company name
        let slug = this.generateSlug(createTenantDto.companyName);

        // Check if slug exists
        const slugExists = await this.prisma.tenant.findFirst({
            where: { slug },
        });

        // If slug exists, append a random string
        if (slugExists) {
            slug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
        }

        if (createTenantDto.providerPublicKey) {
            createTenantDto.providerPublicKey = encryptTenantId(createTenantDto.providerPublicKey);
        }

        if (createTenantDto.providerPrivateKey) {
            createTenantDto.providerPrivateKey = encryptTenantId(createTenantDto.providerPrivateKey);
        }

        if (createTenantDto.webhookSecret) {
            createTenantDto.webhookSecret = encryptTenantId(createTenantDto.webhookSecret);
        }
        const tempDomain = `temp-${Date.now()}-${Math.random()}`;

        // Step 2: Create the tenant with a guaranteed unique placeholder

        const tenant = await this.prisma.tenant.create({
            data: {
                ...createTenantDto,
                slug,
                domainUrl: tempDomain,

                theme: {
                    primary: '#005599',
                    buttonText: '#FFFFFF',
                    ascent: '#FFFFFF',
                    secondary: '#000000',
                },
            },
        });

        // Use transaction to create tenant and main store together
        const result = await this.prisma.$transaction(async (tx) => {
            // Update tenant with final domain
            const updatedTenant = await tx.tenant.update({
                where: { id: tenant.id },
                data: {
                    domainUrl: `tenant-${tenant.id}.ubuxa.ng`,
                },
            });

            // Create main store for the tenant
            const mainStore = await tx.store.create({
                data: {
                    name: `${updatedTenant.companyName} Main Store`,
                    tenantId: updatedTenant.id,
                    type: 'MAIN',
                    phone: updatedTenant.phone,
                    email: updatedTenant.email,
                    isActive: true,
                }
            });

            return { tenant: updatedTenant, mainStore };
        });

        return { 
            message: MESSAGES.CREATED, 
            updatedTenant: result.tenant,
            mainStore: result.mainStore 
        };
    }

    async findAll(filterDto: TenantFilterDto) {
        const { status } = filterDto;

        // Define searchable fields
        const searchFields = ['companyName', 'firstName', 'lastName', 'email'];

        // Create filter options
        const filterOptions = status ? { status } : {};

        // Create Prisma query options
        const queryOptions = createPrismaQueryOptions(
            filterDto,
            searchFields,
            filterOptions
        );

        // Execute query with count
        const [data, total] = await Promise.all([
            this.prisma.tenant.findMany(queryOptions),
            this.prisma.tenant.count({ where: queryOptions.where })
        ]);

        // Return paginated response
        return createPaginatedResponse<Tenant>(data, total, filterDto);
    }

    async findOne(id: string) {
        const tenant = await this.getTenantSafe(id);
        // this.prisma.tenant.findUnique({
        //     where: { id },
        // });

        if (!tenant) {
            throw new NotFoundException(`Tenant with ID ${id} not found`);
        }

        return tenant;
    }

    async update(id: string, updateTenantDto: UpdateTenantDto) {
        // Check if tenant exists
        await this.findOne(id);
        if (updateTenantDto.providerPublicKey) {
            updateTenantDto.providerPublicKey = encryptTenantId(updateTenantDto.providerPublicKey);
        }

        if (updateTenantDto.providerPrivateKey) {
            updateTenantDto.providerPrivateKey = encryptTenantId(updateTenantDto.providerPrivateKey);
        }

        if (updateTenantDto.webhookSecret) {
            updateTenantDto.webhookSecret = encryptTenantId(updateTenantDto.webhookSecret);
        }
        // Update tenant
        const updatedTenant = await this.prisma.tenant.update({
            where: { id },
            data: updateTenantDto,
        });

        return { message: MESSAGES.UPDATED, tenant: updatedTenant };
    }

    async remove(id: string) {
        // Check if tenant exists
        await this.findOne(id);

        // Delete tenant
        await this.prisma.tenant.delete({
            where: { id },
        });

        return { message: MESSAGES.DELETED };
    }

    // Helper method to generate a slug from a string
    private generateSlug(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w ]+/g, '')
            .replace(/ +/g, '-');
    }

    async onboardCompanyAgreedAmount(id: string, updateTenantDto: UpdateTenantDto) {
        updateTenantDto.status = TenantStatus.PENDING;

        const tenant = await this.update(id, updateTenantDto);

        // Check if Admin role already exists for this tenant
        const existingAdminRole = await this.prisma.role.findFirst({
            where: {
                role: 'Admin',
                tenantId: id,
                deleted_at: null,
            },
        });

        if (existingAdminRole) {
            console.log('✅ Admin role already exists for this tenant.');
            return tenant;
        }

        const permissions = await this.prisma.permission.findMany({
            select: { id: true },
        });

        const permissionIds = permissions.map((perm) => perm.id);
        await this.prisma.$transaction(async (tx) => {

            // const role = await this.prisma.$transaction(async (tx) => {
            // Create the role first
            const newRole = await tx.role.create({
                data: {
                    role: 'Admin',
                    active: true,
                    permissionIds: permissionIds,
                    tenantId: id,
                    created_by: null, // or supply system/admin ID if applicable
                },
            });

            // Update the permissions
            await this.prisma.$runCommandRaw({
                update: "permissions",
                updates: [
                    {
                        q: { _id: { $in: permissionIds.map(id => ({ $oid: id })) } },
                        u: { $push: { roleIds: newRole.id } },
                        multi: true
                    }
                ]
            });
            return newRole;
        });

        return tenant;
    }
    async onboardInitialPayment(id: string, usersDetailsDto: CreateTenantUserDto) {
        const {
            email,
            firstname,
            lastname,
            location,
            phone,
            password,
            paymentReference,
        } = usersDetailsDto;
        const paymentVerification = await this.flutterwaveService.verifyTransaction(paymentReference)
        if (!paymentVerification) {
            throw new BadRequestException(MESSAGES.customInvalidMsg('paymentReference is wrong or expired'));
        }

        // update tenant status
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        const tenantUpdated = await this.prisma.tenant.update({
            where: { id },
            data: {
                status: TenantStatus.ONBOARD_PAYMENT_DETAILS,
                cardToken: paymentVerification.data.card.token,
                cardTokenExpirerDate: oneYearFromNow
            },
        })

        if (!tenantUpdated) {
            throw new BadRequestException(MESSAGES.customInvalidMsg('could not update tenant status'));
        }

        const roleExists = await this.prisma.role.findFirst({
            where: { tenantId: id },
        });

        if (!roleExists) {
            throw new BadRequestException(MESSAGES.customInvalidMsg('role'));
        }

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
            include: {
                tenants: {
                    where: { tenantId: id },
                },
            },
        });

        if (existingUser) {
            const alreadyLinked = existingUser.tenants.length > 0;
            if (alreadyLinked) {
                throw new BadRequestException(MESSAGES.USER_TENANT_EXISTS);
            }

            // ✅ Link existing user to tenant if not already linked
            const linkedUserToTenant = await this.linkUserToTenant({
                userId: existingUser.id,
                tenantId: id,
                roleId: roleExists.id,
            });

            return { message: MESSAGES.CREATED, user: existingUser, linkedUserToTenant };
        }


        const hashedPwd = await hashPassword(password);

        const user = await this.prisma.user.create({
            data: {

                emailVerified: true,
                firstname,
                lastname,
                location,
                phone,
                email,
                password: hashedPwd,
                status: UserStatus.active,
            },
        });

        const linkedUserToTenant = await this.linkUserToTenant({
            userId: user.id,
            tenantId: id,
            roleId: roleExists.id
        })

        return { message: MESSAGES.CREATED, user: user, linkedUserToTenant: linkedUserToTenant };
    }

    private async linkUserToTenant(data: {
        userId: string,
        tenantId: string,
        roleId: string
    }) {
        const { userId, tenantId, roleId, } = data;

        return await this.prisma.userTenant.create({
            data: {
                userId: userId,
                tenantId: tenantId,
                roleId: roleId,
            },
        });

    }

    async findOneByUrl(domain: string) {
        // First, make sure your safe-select includes both of these fields:
        const select = {
            ...tenantSafeSelect,
            domainUrl: true,
            agentDomainUrl: true,
        };

        const tenant = await this.prisma.tenant.findFirst({
            where: {
                OR: [
                    { domainUrl: domain },
                    { agentDomainUrl: domain },
                ],
            },
            select,
        });

        if (!tenant) {
            throw new NotFoundException(`Tenant with URL ${domain} not found`);
        }

        // Figure out which field matched:
        const urlType: "user" | "agent" =
            tenant.domainUrl === domain ? "user" : "agent";

        // Strip out the raw domain fields if you don’t want to expose them,
        // then return everything plus urlType:
        const { domainUrl, agentDomainUrl, ...rest } = tenant;
        return {
            ...rest,
            urlType,
        };
    }


    // async findOneByUrl(domainUrl: string) {
    //     const tenant = await this.prisma.tenant.findUnique({
    //         where: { domainUrl },
    //         select: tenantSafeSelect,
    //     });

    //     if (!tenant) {
    //         throw new NotFoundException(`Tenant with ID ${domainUrl} not found`);
    //     }

    //     return tenant;
    // }
    async tenantInitPaymentAcknowledgement(id: string, userId: string) {
        const tenant = await this.findOne(id);
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: tenantSafeSelect,
        });

        await this.Email.sendMail({
            to: tenant.email,
            from: this.config.get<string>('MAIL_FROM'),
            subject: 'Initial Payment Acknowledgement',
            template: './initial-payment-acknowledgement',
            context: {
                name: `${tenant.firstName} ${tenant.lastName}`,
                companyName: `${tenant.companyName}`,
                supportEmail: this.config.get<string>('MAIL_FROM'),
            },
        });

        await this.Email.sendMail({
            to: user.email,
            from: this.config.get<string>('MAIL_FROM'),
            subject: 'Account Created Successfully',
            template: './initial-user-account-creation',
            context: {
                name: `${user.firstName} ${user.lastName}`,
                companyName: `${tenant.companyName}`,
                supportEmail: this.config.get<string>('MAIL_FROM'),
            },
        });
    }

    async isDomainUrlAvailable(domainUrl: string): Promise<boolean> {
        const existingTenant = await this.prisma.tenant.findFirst({
            where: {
                domainUrl: domainUrl,
            },
        });

        return existingTenant ? false : true;
    }
}
