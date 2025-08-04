import { Controller, Post, Body, Get, Param, Patch, Delete, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantFilterDto } from './dto/tenant-filter.dto';
import { EmailService } from '../mailer/email.service';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FileInterceptor } from '@nestjs/platform-express';
import { MESSAGES } from '../constants/index';
import { StorageService } from '../../config/storage.provider';
@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly Email: EmailService,
    private readonly config: ConfigService,
    private readonly storageService: StorageService,
    @InjectQueue('tenant-queue') private tenantQueue: Queue,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Submit a demo request (lead creation)' })
  @ApiCreatedResponse({ description: 'Lead created and email sent.' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async createTenant(@Body() createTenantDto: CreateTenantDto) {
    const { email, firstName, companyName } = createTenantDto;
    const result = await this.tenantsService.createTenant(createTenantDto);
    const platformName = 'Ubuxa Energy CRM';


    if (result.message === MESSAGES.CREATED) {

      await this.Email.sendMail({
        to: email,
        from: this.config.get<string>('MAIL_FROM'),
        subject: 'Demo Request Confirmation',
        template: './tenant-demo-request',
        context: {
          firstName,
          userEmail: email,
          platformName,
          companyName,
          supportEmail: this.config.get<string>('MAIL_FROM'),
        },
      });

      return { message: MESSAGES.RECEIVED };

    }
    return { message: MESSAGES.EMAIL_EXISTS };
  }

  @Get()
  @ApiOperation({ summary: 'Get all tenants with pagination and filtering' })
  @ApiOkResponse({ description: 'List of tenants retrieved successfully.' })
  @ApiQuery({ type: TenantFilterDto })
  async findAll(@Query() filterDto: TenantFilterDto) {
    return this.tenantsService.findAll(filterDto);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a tenant by ID' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiOkResponse({ description: 'Tenant retrieved successfully.' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiOkResponse({ description: 'Tenant updated successfully.' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async update(
    @Param('id') id: string,
    @Body() updateTenantDto: UpdateTenantDto,
    logoUrl: Express.Multer.File,
  ) {
    if (logoUrl) {
      const storage = await this.storageService.uploadFile(logoUrl, 'tenant_logo');
      if (storage) {
        updateTenantDto.logoUrl = storage.url;
        //delete previous file
        // if (bioProfile.profilePicture.length > 0) {
        //     await this.storageService.deleteFile(bioProfile.profilePicture);
        // }

      }
    }
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiOkResponse({ description: 'Tenant deleted successfully.' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }

  @Patch('onboard-company-agreed-amount/:id')
  @ApiOperation({ summary: 'this endpoint is used to update agreed sum of a tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiOkResponse({ description: 'Tenant agreement created  successfully.' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })

  async onboardCompanyAgreedAmount(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {

    const tenant = await this.tenantsService.onboardCompanyAgreedAmount(id, updateTenantDto);
    const platformName = 'Ubuxa Energy CRM';
    const paymentLink = `${this.config.get<string>('FRONTEND_URL_LANDING')}/tenant?tenantId=${id}`;
    await this.Email.sendMail({
      to: tenant.tenant.email,
      from: this.config.get<string>('MAIL_FROM'),
      subject: 'Demo Request Confirmation',
      template: './tenant-payment-link',
      context: {
        email: tenant.tenant.email,
        firstName: tenant.tenant.firstName,
        platformName,
        companyName: tenant.tenant.companyName,
        paymentLink,
        agreedAmount: tenant.tenant.monthlyFee,
        supportEmail: this.config.get<string>('MAIL_FROM'),
      },
    });
    return tenant;
  }

  @Post('onboard-initial-payment/:id')
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiOkResponse({ description: 'Tenant agreement created  successfully.' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async onboardInitialPayment(
    @Param('id') id: string,
    @Body() createUserDto: CreateTenantUserDto,
  ) {

    const user = await this.tenantsService.onboardInitialPayment(id, createUserDto);
    const job = await this.tenantQueue.add(
      'tenant-init-payment-acknowledgement',
      { id, userId: user.user.id },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    console.log({ job });
    return user;
  }

  @Get('/get-tenant-by-url/:url')
  @ApiOperation({ summary: 'Get a tenant by Url' })
  @ApiParam({ name: 'url', description: 'Tenant url' })
  @ApiOkResponse({ description: 'Tenant retrieved successfully.' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async findOneByUrl(@Param('url') url: string) {
    return this.tenantsService.findOneByUrl(url);
  }

  @Patch('tenant-update/:id')
  @UseInterceptors(FileInterceptor('logoUrl'))
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiOkResponse({ description: 'Tenant updated successfully.' })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async customerUpdate(
    @Param('id') id: string,
    @UploadedFile() logoUrl: Express.Multer.File,
    @Body() updateTenantDto: UpdateTenantDto,

  ) {

    if (logoUrl) {
      const storage = await this.storageService.uploadFile(logoUrl, 'tenant_logo');
      if (storage) {
        updateTenantDto.logoUrl = storage.url;
        console.log("storage", storage);
        //delete previous file
        // if (bioProfile.profilePicture.length > 0) {
        //     await this.storageService.deleteFile(bioProfile.profilePicture);
        // }

      }
    }
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Get('check-domain/:id')
  async checkDomainAvailability(@Param('id') domainUrl: string) {
    const available = await this.tenantsService.isDomainUrlAvailable(domainUrl);
    return { available };
  }
}
