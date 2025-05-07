import { Controller, Post, Body } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { MESSAGES } from 'src/constants';
import { EmailService } from 'src/mailer/email.service';
import { ConfigService } from '@nestjs/config';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly Email: EmailService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit a demo request (lead creation)' })
  @ApiCreatedResponse({ description: 'Lead created and email sent.' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async createTenant(@Body() createTenantDto: CreateTenantDto) {
    const { email, firstName, companyName } = createTenantDto;
    await this.tenantsService.createTenant(createTenantDto);
    const platformName = 'Ubuxa Energy CRM';
  

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
}
