// import { Injectable } from "@nestjs/common"
// import type { JwtService } from "@nestjs/jwt"
// import { decryptTenantId } from "../utils/encryptor.decryptor"

// @Injectable()
// export class TenantService {
//     //constructor(private readonly jwtService: JwtService) { }

//     extractTenantId(token: string): string | null {
//         try {
//             if (!token) return null

//             // const payload = this.jwtService.verify(token, {
//             //     secret: process.env.JWT_SECRET_KEY || "fallbackSecret",
//             // })

//             //if (!payload.tenantId) return null

//             return decryptTenantId("payload.tenantId")
//         } catch (error) {
//             console.error("Error extracting tenant ID:", error.message)
//             return null
//         }
//     }

//     shouldSkipTenantCheck(path: string): boolean {
//         const excludedPaths = [
//             "/auth/login",
//             "/auth/register",
//             "/auth/forgot-password",
//             "/auth/reset-password",
//             "/admin",
//             "/health",
//             "/docs",
//         ]

//         return excludedPaths.some((excluded) => path.startsWith(excluded))
//     }
// }

import { Injectable } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { decryptTenantId } from "../utils/encryptor.decryptor"

@Injectable()
export class TenantService {
    private jwtService = new JwtService({
        secret: process.env.JWT_SECRET_KEY,
    });

    extractTenantId(token: string): string | null {
        try {
            if (!token) return null;

            const payload = this.jwtService.verify(token);
            if (!payload.tenantId) return null;

            return decryptTenantId(payload.tenantId);
        } catch (error) {
            console.error("Error extracting tenant ID:", error.message);
            return null;
        }
    }
}

