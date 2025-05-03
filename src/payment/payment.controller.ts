import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  // UnauthorizedException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly config: ConfigService,
    @InjectQueue('payment-queue') private paymentQueue: Queue,
  ) {}

  @ApiOperation({ summary: 'Verify payment callback' })
  @ApiQuery({
    name: 'tx_ref',
    type: String,
    description: 'Transaction reference',
  })
  @ApiQuery({
    name: 'transaction_id',
    type: Number,
    description: 'Transaction ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
  })
  @HttpCode(HttpStatus.OK)
  @Get('verify/callback')
  async verifyPayment(
    @Query('tx_ref') tx_ref: string,
    @Query('transaction_id') transaction_id: number,
    @Res() res: Response,
  ) {
    // await this.paymentService.verifyPayment(tx_ref, transaction_id);
    const job = await this.paymentQueue.add( 
      'verify-payment',
      { tx_ref, transaction_id },
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

    // return res.redirect(
    //   this.config.get<string>('FRONTEND_SUCCESSFUL_SALES_URL'),
    // );
    return res.json({ message: 'Payment verification initiated.' });
  }

  @Post('flw-webhook')
  async handleWebhook(
    @Headers('verif-hash') signature: string,
    @Body() payload: any,
    @Res() res: Response,
  ) {
    // const FLW_WEBHOOK_SECRET = this.config.get<string>('FLW_WEBHOOK_SECRET');

    // if (FLW_WEBHOOK_SECRET !== signature) {
    //   throw new UnauthorizedException();
    // }

    await this.paymentService.verifyWebhookSignature(payload);

    res.status(200).end();
  }
}
