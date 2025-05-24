import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TenantsService } from './tenants.service';

@Processor('tenant-queue')
export class TenantProcessor extends WorkerHost {
    constructor(private readonly tenantService: TenantsService) {
        super();
    }

    async process(job: Job<{ id: string; userId: string }>) {
        // Check job name to determine what to do
        if (job.name === 'tenant-init-payment-acknowledgement') {
            const { id, userId } = job.data;

            try {
                await this.tenantService.tenantInitPaymentAcknowledgement(id, userId);
                return { success: true };
            } catch (error) {
                throw error;
            }
        }

        return { processed: true };
    }

    @OnWorkerEvent('completed')
    onCompleted() {
        //console.log('Completed Payment Queue ✅');
    }
}
