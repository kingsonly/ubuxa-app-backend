import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DeviceService } from './device.service';
import { StorageService } from '../../config/storage.provider';


@Processor('csv-device-upload-queue')
export class DeviceProcessor extends WorkerHost {
    constructor(
        private readonly deviceService: DeviceService,
        private readonly storageService: StorageService,
    ) { super(); }

    async process(job: Job) {
        console.log(`[PROCESSOR] #${job.id} processing`);
        if (job.name === 'process-devices') {
            await this.deviceService.handleDeviceUpload(job);
        }
        return { processed: true };
    }

    @OnWorkerEvent('completed')
    async onCompleted(job: Job) {
        console.log(`✅ Job ${job.id} completed`);
        const { fileKey } = job.data as any;
        if (fileKey) {
            try {
                await this.storageService.deleteFile(fileKey);
                console.log(`🗑️ Deleted remote file: ${fileKey}`);
            } catch (err) {
                console.error('Failed to delete remote file', err);
            }
        }
    }
}

