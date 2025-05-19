import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { TenantService } from "./tenant.service"

@Module({
    imports: [
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>("JWT_SECRET_KEY") || "fallbackSecret",
                signOptions: { expiresIn: "1d" },
            }),
        }),
    ],
    providers: [TenantService],
    exports: [TenantService, JwtModule],
})
export class TenantModule { }
