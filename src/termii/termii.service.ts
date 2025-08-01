import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface DeviceTokenSmsData {
    deviceSerialNumber: string;
    deviceToken: string;
    deviceName?: string;
}

export interface SendSmsOptions {
    to: string;
    message: string;
    type?: 'plain' | 'unicode';
    channel?: 'dnd' | 'whatsapp' | 'generic';
    from?: string;
}

@Injectable()
export class TermiiService {
    private readonly logger = new Logger(TermiiService.name);
    //   private readonly baseUrl = 'https://api.ng.termii.com/api';
    private readonly baseUrl = 'https://v3.api.termii.com/api';
    private readonly apiKey: string | null;
    private readonly senderId: string;

    constructor(
        private readonly config: ConfigService,
        private readonly httpService: HttpService,
    ) {
        this.apiKey = this.config.get<string>('TERMII_API_KEY') || null;
        this.senderId = this.config.get<string>('TERMII_SENDER_ID', 'Energy');

        if (!this.apiKey) {
            this.logger.warn(
                'TERMII_API_KEY not configured. SMS functionality will be disabled.',
            );
        }
    }

    async sendSms(options: SendSmsOptions): Promise<any> {
        if (!this.apiKey) {
            this.logger.warn('SMS not sent - TERMII_API_KEY not configured');
            return { success: false, message: 'SMS service not configured' };
        }

        try {
            const payload = {
                to: this.formatPhoneNumber(options.to),
                from: options.from || this.senderId,
                sms: options.message,
                type: options.type || 'plain',
                channel: options.channel || 'generic',
                api_key: this.apiKey,
            };

            this.logger.log(`Sending SMS to ${payload.to}`);

            const response = await firstValueFrom(
                this.httpService.post(`${this.baseUrl}/sms/send`, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }),
            );

            this.logger.log(`SMS sent successfully to ${payload.to}`);
            return response.data;
        } catch (error) {
            this.logger.error(
                `Failed to send SMS to ${options.to}:`,
                error.response?.data || error.message,
            );
            throw new Error(
                `SMS sending failed: ${error.response?.data?.message || error.message}`,
            );
        }
    }

    async sendDeviceTokensSms(
        phoneNumber: string,
        deviceTokens: DeviceTokenSmsData,
        customerName?: string,
    ): Promise<any> {
        const message = this.formatDeviceTokensMessage(deviceTokens, customerName);

        return await this.sendSms({
            to: phoneNumber,
            message,
            type: 'plain',
            channel: 'generic',
        });
    }

    private formatDeviceTokensMessage(
        deviceTokens: DeviceTokenSmsData,
        customerName?: string,
    ): string {
        const greeting = customerName ? `Dear ${customerName},` : 'Dear Customer,';

        let message = `${greeting} Your device token is ready: Device: ${deviceTokens.deviceSerialNumber} Token:  ${deviceTokens.deviceToken} Keep this token safe—you’ll need it to activate your device. For support, contact us. Thank you!`.trim();

        // Termii SMS limit is usually 160 characters for single SMS, 1600 for long SMS
        if (message.length > 1600) {
            // Truncate message if too long
            message =
                message.substring(0, 1550) +
                '...\n\nFor full details, check your email.';
        }

        return message;
    }

    private formatPhoneNumber(phoneNumber: string): string {
        let cleaned = phoneNumber.replace(/\D/g, '');

        if (cleaned.startsWith('0')) {
            cleaned = '234' + cleaned.substring(1);
        } else if (!cleaned.startsWith('234')) {
            cleaned = '234' + cleaned;
        }

        return cleaned;
    }

    async getAccountBalance(): Promise<any> {
        if (!this.apiKey) {
            throw new Error('TERMII_API_KEY not configured');
        }

        try {
            const response = await firstValueFrom(
                this.httpService.get(
                    `${this.baseUrl}/get-balance?api_key=${this.apiKey}`,
                ),
            );
            return response.data;
        } catch (error) {
            this.logger.error(
                'Failed to get account balance:',
                error.response?.data || error.message,
            );
            throw new Error(
                `Failed to get balance: ${error.response?.data?.message || error.message}`,
            );
        }
    }

    async testSmsConnection(): Promise<boolean> {
        try {
            return this.getAccountBalance();
        } catch (error) {
            this.logger.error('SMS connection test failed:', error.message);
            return false;
        }
    }
}