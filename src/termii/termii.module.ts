import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TermiiController } from './termii.controller';
import { TermiiService } from './termii.service';

@Module({
    imports: [
        HttpModule.register({
            timeout: 10000,
            maxRedirects: 5,
        }),
        ConfigModule,
    ],
    controllers: [TermiiController],
    providers: [TermiiService],
})
export class TermiiModule { }