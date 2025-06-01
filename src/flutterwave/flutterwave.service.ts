//TODO:  ORIGINAL FILE

// import { HttpException, Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { PrismaService } from '../prisma/prisma.service';
// import axios from 'axios';
// import * as Flutterwave from 'flutterwave-node-v3';
// import { PaymentStatus } from '@prisma/client';

// interface PaymentPayload {
//   amount: number;
//   email: string;
//   saleId: string;
//   name?: string;
//   phone?: string;
//   transactionRef?: string;
// }

// @Injectable()
// export class FlutterwaveService {
//   private flw: any;

//   private flwBaseUrl: string;

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly configService: ConfigService,
//   ) {
//     this.flw = new Flutterwave(
//       this.configService.get<string>('FLW_PUBLIC_KEY'),
//       this.configService.get<string>('FLW_SECRET_KEY'),
//     );

//     this.flwBaseUrl = 'https://api.flutterwave.com/v3';
//   }

//   async generatePaymentLink(paymentDetails: PaymentPayload) {
//     const { amount, email, saleId, transactionRef } = paymentDetails;

//     const payload = {
//       amount,
//       tx_ref: transactionRef,
//       currency: 'NGN',
//       enckey: this.configService.get<string>('FLW_ENCRYPTION_KEY'),
//       customer: {
//         email,
//       },
//       payment_options: 'banktransfer',
//       customizations: {
//         title: 'Product Purchase',
//         description: `Payment for sale ${saleId}`,
//         logo: this.configService.get<string>('COMPANY_LOGO_URL'),
//       },
//       redirect_url: this.configService.get<string>('PAYMENT_REDIRECT_URL'),
//       meta: {
//         saleId,
//       },
//     };

//     const payment = await this.prisma.payment.create({
//       data: {
//         saleId,
//         amount,
//         transactionRef,
//         paymentDate: new Date(),
//       },
//     });

//     // Currently, i cannot find a method in the flutterwave
//     // sdk to create payment links. That is the
//     // reason for the fallback axios request.
//     const url = `${this.flwBaseUrl}/payments`;
//     try {
//       const { data } = await axios.post(url, payload, {
//         headers: {
//           Authorization: `Bearer ${this.configService.get<string>('FLW_SECRET_KEY')}`,
//           'Content-Type': 'application/json',
//         },
//       });

//       if (data.status !== 'success') {
//         await this.prisma.$transaction([
//           this.prisma.payment.update({
//             where: { id: payment.id },
//             data: {
//               paymentStatus: PaymentStatus.FAILED,
//             },
//           }),
//           this.prisma.paymentResponses.create({
//             data: {
//               paymentId: payment.id,
//               data,
//             },
//           }),
//         ]);
//         throw new HttpException(
//           `Payment link not generated ${data.message}`,
//           500,
//         );
//       }
//       return data.data;
//     } catch (error) {
//       // console.log({ error });
//       await this.prisma.$transaction([
//         this.prisma.payment.update({
//           where: { id: payment.id },
//           data: {
//             paymentStatus: PaymentStatus.FAILED,
//           },
//         }),
//         this.prisma.paymentResponses.create({
//           data: {
//             paymentId: payment.id,
//             data: error,
//           },
//         }),
//       ]);
//       throw new Error(`Failed to generate payment link: ${error.message}`);
//     }
//   }

//   async generateStaticAccount(
//     saleId: string,
//     email: string,
//     bvn: string,
//     transactionRef: string,
//   ) {
//     try {
//       const payload = {
//         //   amount: monthlyPayment,
//         // frequency: installmentDuration,
//         tx_ref: transactionRef,
//         bvn,
//         is_permanent: true,
//         narration: `Please make a bank transfer for the installment payment of sale ${saleId}`,
//         email,
//       };

//       const response = await this.flw.VirtualAcct.create(payload);

//       if (response.status !== 'success') {
//         throw new HttpException(
//           response.message || 'Failed to generate virtual account',
//           400,
//         );
//       }
//       return response.data;
//     } catch (error) {
//       // console.log({ error });
//       throw new Error(`Failed to generate static account: ${error.message}`);
//     }
//   }

//   async verifyTransaction(transactionId: number) {
//     try {
//       const response = await this.flw.Transaction.verify({ id: transactionId });

//       if (response.status !== 'success' && response.status !== 'completed') {
//         throw new HttpException(
//           response.message || 'Failed to verify transaction',
//           400,
//         );
//       }
//       return response;
//     } catch (error) {
//       // console.log({ error });

//       throw new Error(`Failed to verify transaction: ${error.message}`);
//     }
//   }

//   async refundPayment(transactionId: number, amountToRefund: number) {
//     try {
//       const response = await this.flw.Transaction.refund({
//         id: transactionId,
//         amount: amountToRefund,
//       });
//       if (response.status !== 'success' && response.status !== 'completed') {
//         throw new HttpException(
//           response.message || 'Failed to perform refund',
//           400,
//         );
//       }
//       return response;
//     } catch (error) {
//       // console.log({ error });

//       throw new Error(`Failed to verify transaction: ${error.message}`);
//     }
//   }
// }

//TODO: VERSION 2 WITH TENANT CONTEXT
// import { HttpException, Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { PrismaService } from '../prisma/prisma.service';
// import { TenantContext } from '../tenants/context/tenant.context';
// import axios from 'axios';
// import * as Flutterwave from 'flutterwave-node-v3';
// import { PaymentStatus, PaymentProvider } from '@prisma/client';

// interface PaymentPayload {
//   amount: number;
//   email: string;
//   saleId: string;
//   name?: string;
//   phone?: string;
//   transactionRef?: string;
// }

// interface FlutterwaveConfig {
//   publicKey: string;
//   secretKey: string;
//   encryptionKey: string;
// }

// @Injectable()
// export class FlutterwaveService {
//   private flwBaseUrl: string;

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly configService: ConfigService,
//     private readonly tenantContext: TenantContext,
//   ) {
//     this.flwBaseUrl = 'https://api.flutterwave.com/v3';
//   }

//   private async getFlutterwaveConfig(): Promise<FlutterwaveConfig> {
//     const tenantId = this.tenantContext.getTenantId();

//     if (tenantId) {
//       // Get tenant-specific Flutterwave keys
//       const tenant = await this.prisma.tenant.findUnique({
//         where: { id: tenantId },
//         select: {
//           paymentProvider: true,
//           providerPublicKey: true,
//           providerPrivateKey: true,
//         },
//       });

//       if (tenant &&
//           tenant.paymentProvider === PaymentProvider.FLUTTERWAVE &&
//           tenant.providerPublicKey &&
//           tenant.providerPrivateKey) {
//         return {
//           publicKey: tenant.providerPublicKey,
//           secretKey: tenant.providerPrivateKey,
//           // For tenant-specific encryption key, you might want to add this field to the Tenant model
//           // For now, falling back to env variable
//           encryptionKey: this.configService.get<string>('FLW_ENCRYPTION_KEY'),
//         };
//       }
//     }

//     // Fallback to environment variables (for app owner payments)
//     return {
//       publicKey: this.configService.get<string>('FLW_PUBLIC_KEY'),
//       secretKey: this.configService.get<string>('FLW_SECRET_KEY'),
//       encryptionKey: this.configService.get<string>('FLW_ENCRYPTION_KEY'),
//     };
//   }

//   private async getFlutterwaveInstance() {
//     const config = await this.getFlutterwaveConfig();
//     return new Flutterwave(config.publicKey, config.secretKey);
//   }

//   async generatePaymentLink(paymentDetails: PaymentPayload) {
//     const tenantId = this.tenantContext.getTenantId();
//     const { amount, email, saleId, transactionRef } = paymentDetails;
//     const config = await this.getFlutterwaveConfig();

//     const payload = {
//       amount,
//       tx_ref: transactionRef,
//       currency: 'NGN',
//       enckey: config.encryptionKey,
//       customer: {
//         email,
//       },
//       payment_options: 'banktransfer',
//       customizations: {
//         title: 'Product Purchase',
//         description: `Payment for sale ${saleId}`,
//         logo: this.configService.get<string>('COMPANY_LOGO_URL'),
//       },
//       redirect_url: this.configService.get<string>('PAYMENT_REDIRECT_URL'),
//       meta: {
//         saleId,
//         ...(tenantId && { tenantId }), // Include tenantId in metadata if available
//       },
//     };

//     const payment = await this.prisma.payment.create({
//       data: {
//         saleId,
//         amount,
//         transactionRef,
//         paymentDate: new Date(),
//         ...(tenantId && { tenantId }), // Include tenantId if available
//       },
//     });

//     // Currently, i cannot find a method in the flutterwave
//     // sdk to create payment links. That is the
//     // reason for the fallback axios request.
//     const url = `${this.flwBaseUrl}/payments`;
//     try {
//       const { data } = await axios.post(url, payload, {
//         headers: {
//           Authorization: `Bearer ${config.secretKey}`,
//           'Content-Type': 'application/json',
//         },
//       });

//       if (data.status !== 'success') {
//         await this.prisma.$transaction([
//           this.prisma.payment.update({
//             where: { id: payment.id },
//             data: {
//               paymentStatus: PaymentStatus.FAILED,
//             },
//           }),
//           this.prisma.paymentResponses.create({
//             data: {
//               paymentId: payment.id,
//               data,
//             },
//           }),
//         ]);
//         throw new HttpException(
//           `Payment link not generated ${data.message}`,
//           500,
//         );
//       }
//       return data.data;
//     } catch (error) {
//       // console.log({ error });
//       await this.prisma.$transaction([
//         this.prisma.payment.update({
//           where: { id: payment.id },
//           data: {
//             paymentStatus: PaymentStatus.FAILED,
//           },
//         }),
//         this.prisma.paymentResponses.create({
//           data: {
//             paymentId: payment.id,
//             data: error,
//           },
//         }),
//       ]);
//       throw new Error(`Failed to generate payment link: ${error.message}`);
//     }
//   }

//   async generateStaticAccount(
//     saleId: string,
//     email: string,
//     bvn: string,
//     transactionRef: string,
//   ) {
//     const tenantId = this.tenantContext.getTenantId();

//     try {
//       const flw = await this.getFlutterwaveInstance();

//       const payload = {
//         //   amount: monthlyPayment,
//         // frequency: installmentDuration,
//         tx_ref: transactionRef,
//         bvn,
//         is_permanent: true,
//         narration: `Please make a bank transfer for the installment payment of sale ${saleId}`,
//         email,
//         ...(tenantId && {
//           meta: {
//             tenantId,
//             saleId
//           }
//         }),
//       };

//       const response = await flw.VirtualAcct.create(payload);

//       if (response.status !== 'success') {
//         throw new HttpException(
//           response.message || 'Failed to generate virtual account',
//           400,
//         );
//       }
//       return response.data;
//     } catch (error) {
//       // console.log({ error });
//       throw new Error(`Failed to generate static account: ${error.message}`);
//     }
//   }

//   async verifyTransaction(transactionId: number) {
//     try {
//       const flw = await this.getFlutterwaveInstance();
//       const response = await flw.Transaction.verify({ id: transactionId });

//       if (response.status !== 'success' && response.status !== 'completed') {
//         throw new HttpException(
//           response.message || 'Failed to verify transaction',
//           400,
//         );
//       }
//       return response;
//     } catch (error) {
//       // console.log({ error });
//       throw new Error(`Failed to verify transaction: ${error.message}`);
//     }
//   }

//   async refundPayment(transactionId: number, amountToRefund: number) {
//     try {
//       const flw = await this.getFlutterwaveInstance();
//       const response = await flw.Transaction.refund({
//         id: transactionId,
//         amount: amountToRefund,
//       });

//       if (response.status !== 'success' && response.status !== 'completed') {
//         throw new HttpException(
//           response.message || 'Failed to perform refund',
//           400,
//         );
//       }
//       return response;
//     } catch (error) {
//       // console.log({ error });
//       throw new Error(`Failed to verify transaction: ${error.message}`);
//     }
//   }

//   /**
//    * Method to handle webhook verification with tenant context
//    * This ensures webhooks are processed with the correct tenant's keys
//    */
//   async verifyWebhookSignature(signature: string, payload: any): Promise<boolean> {
//     try {
//       const config = await this.getFlutterwaveConfig();
//       const flw = new Flutterwave(config.publicKey, config.secretKey);

//       // Implement webhook verification logic here
//       // This would depend on Flutterwave's webhook verification process
//       return true; // Placeholder - implement actual verification
//     } catch (error) {
//       console.error('Webhook verification failed:', error);
//       return false;
//     }
//   }

//   /**
//    * Get payment history filtered by tenant
//    */
//   async getPaymentHistory(filters?: any) {
//     const tenantId = this.tenantContext.getTenantId();

//     const whereClause = {
//       ...(tenantId && { tenantId }),
//       ...filters,
//     };

//     return this.prisma.payment.findMany({
//       where: whereClause,
//       orderBy: { createdAt: 'desc' },
//     });
//   }
// }

//TODO: VERSION 3 WITH TENANT CONTEXT AND WEBHOOK HANDLING
import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenants/context/tenant.context';
import axios from 'axios';
import * as Flutterwave from 'flutterwave-node-v3';
import { PaymentStatus, PaymentProvider } from '@prisma/client';

interface PaymentPayload {
  amount: number;
  email: string;
  saleId: string;
  name?: string;
  phone?: string;
  transactionRef?: string;
}

interface FlutterwaveConfig {
  publicKey: string;
  secretKey: string;
  encryptionKey: string;
  company?: string;
  logo?: string;
}

@Injectable()
export class FlutterwaveService {
  private flwBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContext,
  ) {
    this.flwBaseUrl = 'https://api.flutterwave.com/v3';
  }

  private async getFlutterwaveConfig(): Promise<FlutterwaveConfig> {
    const tenantId = this.tenantContext.getTenantId();

    if (tenantId) {
      // Get tenant-specific Flutterwave keys
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          paymentProvider: true,
          providerPublicKey: true,
          providerPrivateKey: true,
          companyName: true,
          logoUrl: true,
        },
      });

      if (tenant &&
        tenant.paymentProvider === PaymentProvider.FLUTTERWAVE &&
        tenant.providerPublicKey &&
        tenant.providerPrivateKey) {
        return {
          publicKey: tenant.providerPublicKey,
          secretKey: tenant.providerPrivateKey,
          company: tenant.companyName,
          logo: tenant.logoUrl,
          // For tenant-specific encryption key, you might want to add this field to the Tenant model
          // For now, falling back to env variable
          encryptionKey: this.configService.get<string>('FLW_ENCRYPTION_KEY'),
        };
      }
    }

    // Fallback to environment variables (for app owner payments)
    return {
      publicKey: this.configService.get<string>('FLW_PUBLIC_KEY'),
      secretKey: this.configService.get<string>('FLW_SECRET_KEY'),
      encryptionKey: this.configService.get<string>('FLW_ENCRYPTION_KEY'),
      logo: this.configService.get<string>('COMPANY_LOGO_URL'),
      company: this.configService.get<string>('APP_NAME'),
    };
  }

  private async getFlutterwaveInstance() {
    const config = await this.getFlutterwaveConfig();
    return new Flutterwave(config.publicKey, config.secretKey);
  }

  async generatePaymentLink(paymentDetails: PaymentPayload) {
    const tenantId = this.tenantContext.getTenantId(); // Returns null if no tenant context
    const { amount, email, saleId, transactionRef } = paymentDetails;
    const config = await this.getFlutterwaveConfig();

    const payload = {
      amount,
      tx_ref: transactionRef,
      currency: 'NGN',
      enckey: config.encryptionKey,
      customer: {
        email,
      },
      payment_options: 'banktransfer',
      customizations: {
        title: 'Product Purchase',
        description: `Payment for sale ${saleId}`,
        logo: config.logo,
        company: config.company,
      },
      redirect_url: this.configService.get<string>('PAYMENT_REDIRECT_URL'),
      meta: {
        saleId,
        ...(tenantId && { tenantId }), // Only include if tenantId exists
      },
    };

    const payment = await this.prisma.payment.create({
      data: {
        saleId,
        amount,
        transactionRef,
        paymentDate: new Date(),
        ...(tenantId && { tenantId }), // Only include if tenantId exists - null is fine for app owner payments
      },
    });

    // Currently, i cannot find a method in the flutterwave
    // sdk to create payment links. That is the
    // reason for the fallback axios request.
    const url = `${this.flwBaseUrl}/payments`;
    try {
      const { data } = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json',
        },
      });


      //FIXME: LINE 624, remove the tenantId check from the response, also check the payment response model for the relationship
      if (data.status !== 'success') {
        await this.prisma.$transaction([
          this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              paymentStatus: PaymentStatus.FAILED,
            },
          }),
          this.prisma.paymentResponses.create({
            data: {
              paymentId: payment.id,
              data,
              ...(tenantId && { tenantId }), // Only include if tenantId exists
            },
          }),
        ]);
        throw new HttpException(
          `Payment link not generated ${data.message}`,
          500,
        );
      }
      return data.data;
    } catch (error) {
      // console.log({ error });
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            paymentStatus: PaymentStatus.FAILED,
          },
        }),
        this.prisma.paymentResponses.create({
          data: {
            paymentId: payment.id,
            data: error,
            tenantId
          },
        }),
      ]);
      throw new Error(`Failed to generate payment link: ${error.message}`);
    }
  }

  async generateStaticAccount(
    saleId: string,
    email: string,
    bvn: string,
    transactionRef: string,
  ) {
    const tenantId = this.tenantContext.getTenantId();

    try {
      const flw = await this.getFlutterwaveInstance();

      const payload = {
        //   amount: monthlyPayment,
        // frequency: installmentDuration,
        tx_ref: transactionRef,
        bvn,
        is_permanent: true,
        narration: `Please make a bank transfer for the installment payment of sale ${saleId}`,
        email,
        // ...(tenantId && {
        //   meta: {
        //     tenantId,
        //     saleId
        //   }
        // }),
      };

      const response = await flw.VirtualAcct.create(payload);

      if (response.status !== 'success') {
        throw new HttpException(
          response.message || 'Failed to generate virtual account',
          400,
        );
      }
      return response.data;
    } catch (error) {
      console.log("i am full error", { error });
      throw new HttpException(
        `Failed to generate static account: ${error.message}`,
        400,
      );
      //throw new Error(`Failed to generate static account: ${error.message}`);
    }
  }

  async verifyTransaction(transactionId: number) {
    try {
      const flw = await this.getFlutterwaveInstance();
      const response = await flw.Transaction.verify({ id: transactionId });

      if (response.status !== 'success' && response.status !== 'completed') {
        throw new HttpException(
          response.message || 'Failed to verify transaction',
          400,
        );
      }
      return response;
    } catch (error) {
      // console.log({ error });
      throw new Error(`Failed to verify transaction: ${error.message}`);
    }
  }

  async refundPayment(transactionId: number, amountToRefund: number) {
    try {
      const flw = await this.getFlutterwaveInstance();
      const response = await flw.Transaction.refund({
        id: transactionId,
        amount: amountToRefund,
      });

      if (response.status !== 'success' && response.status !== 'completed') {
        throw new HttpException(
          response.message || 'Failed to perform refund',
          400,
        );
      }
      return response;
    } catch (error) {
      // console.log({ error });
      throw new Error(`Failed to verify transaction: ${error.message}`);
    }
  }


}