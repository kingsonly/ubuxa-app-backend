// device-token.processor.ts
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DeviceService } from './device.service';
import { SalesService } from '../sales/sales.service';
import { EmailService } from 'src/mailer/email.service';
import { TermiiService } from 'src/termii/termii.service';
import { Logger } from '@nestjs/common';


@Processor('device-token-queue')
export class DeviceTokenProcessor extends WorkerHost {
    constructor(
        private readonly deviceService: DeviceService,
        private readonly salesService: SalesService,
    ) { super(); }
    private readonly logger = new Logger("TermiiService.name");

    async process(job: Job) {

        if (job.name === 'generate-token') {

            const { deviceId, duration, userId, tenantId } = job.data as { deviceId: string; duration: number, userId: string, tenantId: string };
            const { token, serial } = await this.deviceService.generateToken(deviceId, duration, tenantId);

            const sale = await this.salesService.findSaleByDevice(deviceId);
            if (sale) {
                console.log("here we are 1", job.data)
                const { SaleRecipient: customer } = sale;
                this.deviceService.sendTokenToCustomer({ customer, token: token.deviceToken, serial, duration });
            }
            console.log("here we are 2 ", job.data)
            this.deviceService.sendTokenToUser({ userId, token: token.deviceToken, serial, duration })
        }


    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(`Job ${job.id} failed: ${err.message}`);
        // you could requeue or alert here
    }
}
