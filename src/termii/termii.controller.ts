import { Controller, Get } from '@nestjs/common';
import { TermiiService } from './termii.service';


@Controller('termii')
export class TermiiController {
    constructor(private readonly termiiService: TermiiService) { }

    @Get('test')
    async testConnection() {
        return await this.termiiService.testSmsConnection();
    }
}