import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMode, PaymentStatus, SalesStatus } from '@prisma/client';
import { EmailService } from '../mailer/email.service';
import { ConfigService } from '@nestjs/config';
import { OpenPayGoService } from '../openpaygo/openpaygo.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { TenantContext } from '../tenants/context/tenant.context';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly Email: EmailService,
    private readonly config: ConfigService,
    private readonly openPayGo: OpenPayGoService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly tenantContext: TenantContext,
  ) {}

  async generatePaymentLink(
    saleId: string,
    amount: number,
    email: string,
    transactionRef: string,
  ) {
    return this.flutterwaveService.generatePaymentLink({
      saleId,
      amount,
      email,
      transactionRef,
    });
  }

  async generatePaymentPayload(
    saleId: string,
    amount: number,
    email: string,
    transactionRef: string,
  ) {
    const tenantId = this.tenantContext.getTenantId(); // Returns null if no tenant context
    await this.prisma.payment.create({
      data: {
        saleId,
        amount,
        transactionRef,
        paymentDate: new Date(),
        tenantId,
      },
    });

    const sale = await this.prisma.sales.findFirst({
      where: {
        id: saleId,
      },
      include: {
        saleItems: {
          include: {
            product: true,
            devices: true,
          },
        },
      },
    });

    const financialMargins = await this.prisma.financialSettings.findFirst();

    return {
      sale,
      financialMargins,
      paymentData: {
        amount,
        tx_ref: transactionRef,
        currency: 'NGN',
        customer: {
          email,
        },
        payment_options: 'banktransfer',
        customizations: {
          title: 'Product Purchase',
          description: `Payment for sale ${saleId}`,
          logo: this.config.get<string>('COMPANY_LOGO_URL'),
        },
        meta: {
          saleId,
        },
      },
    };
  }

  async generateStaticAccount(
    saleId: string,
    email: string,
    bvn: string,
    transactionRef: string,
  ) {
    return this.flutterwaveService.generateStaticAccount(
      saleId,
      email,
      bvn,
      transactionRef,
    );
  }

  async verifyPayment(ref: string | number, transaction_id: number) {
    const tenantId = this.tenantContext.getTenantId(); // Returns null if no tenant context

    const paymentExist = await this.prisma.payment.findUnique({
      where: {
        transactionRef: ref as string,
        tenantId
      },
      include: {
        sale: true,
      },
    });

    if (!paymentExist)
      throw new BadRequestException(`Payment with ref: ${ref} does not exist.`);

    const res = await this.flutterwaveService.verifyTransaction(transaction_id);

    if (
      paymentExist.paymentStatus === PaymentStatus.FAILED &&
      paymentExist.sale.status === SalesStatus.CANCELLED
    ) {
      const refundResponse = await this.flutterwaveService.refundPayment(
        transaction_id,
        res.data.charged_amount,
      );

      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: paymentExist.id },
          data: {
            paymentStatus: PaymentStatus.REFUNDED,
          },
        }),
        this.prisma.paymentResponses.create({
          data: {
            paymentId: paymentExist.id,
            data: refundResponse,
            tenantId, // Explicit tenant assignment

          },
        }),
      ]);

      throw new BadRequestException(
        'This sale is cancelled already. Refund Initialised!',
      );
    }

    if (paymentExist.paymentStatus !== PaymentStatus.COMPLETED) {
      const [paymentData] = await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: paymentExist.id },
          data: {
            paymentStatus: PaymentStatus.COMPLETED,
          },
        }),
        this.prisma.paymentResponses.create({
          data: {
            paymentId: paymentExist.id,
            data: res,
            tenantId
          },
        }),
      ]);

      await this.handlePostPayment(paymentData);
    }

    return 'success';
  }

  private async handlePostPayment(paymentData: any) {
    const tenantId = this.tenantContext.requireTenantId();
    const sale = await this.prisma.sales.findUnique({
      where: { id: paymentData.saleId,tenantId  },
      include: {
        saleItems: {
          include: {
            product: true,
            devices: true,
            SaleRecipient: true,
          },
        },
        customer: true,
        installmentAccountDetails: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    const updatedSale = await this.prisma.sales.update({
      where: { id: sale.id },
      data: {
        totalPaid: {
          increment: paymentData.amount,
        },
        status:
          sale.totalPaid + paymentData.amount >= sale.totalPrice
            ? SalesStatus.COMPLETED
            : SalesStatus.IN_INSTALLMENT,
      },
    });

    // Process tokenable devices
    const deviceTokens = [];
    for (const saleItem of sale.saleItems) {
      const saleDevices = saleItem.devices;
      const tokenableDevices = saleDevices.filter(
        (device) => device.isTokenable,
      );
      if (tokenableDevices.length) {
        let tokenDuration: number;
        if (saleItem.paymentMode === PaymentMode.ONE_OFF) {
          // Generate forever token
          tokenDuration = -1; // Represents forever
        } else {
          // Calculate token duration based on payment
          const monthlyPayment =
            (saleItem.totalPrice - saleItem.installmentStartingPrice) /
            saleItem.installmentDuration;
          const monthsCovered = Math.floor(paymentData.amount / monthlyPayment);
          tokenDuration = monthsCovered * 30; // Convert months to days
        }

        for (const device of tokenableDevices) {
          const token = await this.openPayGo.generateToken(
            device,
            tokenDuration,
            Number(device.count),
          );

          deviceTokens.push({
            deviceSerialNumber: device.serialNumber,
            deviceKey: device.key,
            deviceToken: token.finalToken,
          });

          await this.prisma.device.update({
            where: {
              id: device.id,
            },
            data: {
              count: String(token.newCount),
            },
          });

          await this.prisma.tokens.create({
            data: {
              deviceId: device.id,
              tenantId, // ✅ link to tenant
              token: String(token.newCount),
            },
          });
        }
      }
    }

    console.log({ deviceTokens });

    if (deviceTokens.length) {
      await this.Email.sendMail({
        to: sale.customer.email,
        from: this.config.get<string>('MAIL_FROM'),
        subject: `Here are your device tokens`,
        template: './device-tokens',
        context: {
          tokens: JSON.stringify(deviceTokens, undefined, 4),
        },
      });
    }

    if (sale.installmentAccountDetailsId && !sale.deliveredAccountDetails) {
      await this.Email.sendMail({
        to: sale.customer.email,
        from: this.config.get<string>('MAIL_FROM'),
        subject: `Here is your account details for installment payments`,
        template: './installment-account-details',
        context: {
          details: JSON.stringify(sale.installmentAccountDetails, undefined, 4),
        },
      });

      await this.prisma.sales.update({
        where: {
          id: sale.id,
        },
        data: {
          deliveredAccountDetails: true,
        },
      });
    }

    return updatedSale;
  }

  async verifyWebhookSignature(payload: any) {
  const tenantId = this.tenantContext.getTenantId()
    const txRef = payload?.data?.tx_ref;
    const status = payload?.data?.status;

    if (!txRef || status !== 'successful') {
      console.error('Invalid webhook payload:', payload);
      return;
    }

    const paymentExist = await this.prisma.payment.findUnique({
      where: { transactionRef: txRef, tenantId  },
    });

    if (!paymentExist) {
      console.warn(`Payment not found for txRef: ${txRef}`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.paymentResponses.create({
        data: {
          paymentId: paymentExist.id,
          tenantId,
          data: payload,
        },
      }),
    ]);

    console.log(`Payment updated successfully for txRef: ${txRef}`);
    console.log({ payload });
  }
}
