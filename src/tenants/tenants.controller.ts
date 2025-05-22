import { Controller, Post, Body, Get, Param, Patch, Delete, Query } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantFilterDto } from './dto/tenant-filter.dto';
import { MESSAGES } from 'src/constants';
import { EmailService } from 'src/mailer/email.service';
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
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly Email: EmailService,
    private readonly config: ConfigService,
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
  async update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
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
  async onboardInitialPayment(@Param('id') id: string, @Body() createUserDto: CreateUserDto) {

    const user = await this.tenantsService.onboardInitialPayment(id, createUserDto);
    // const platformName = 'Ubuxa Energy CRM';
    // const paymentLink = `${this.config.get<string>('FRONTEND_URL_LANDING')}/tenant?tenantId=${id}`;
    // await this.Email.sendMail({
    //   to: user.user.email,
    //   from: this.config.get<string>('MAIL_FROM'),
    //   subject: 'Demo Request Confirmation',
    //   template: './tenant-payment-link',
    //   context: {
    //     email: user.user.email,
    //     firstName: user.user.firstname,
    //     platformName,
    //     supportEmail: this.config.get<string>('MAIL_FROM'),
    //   },
    // });
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
}
