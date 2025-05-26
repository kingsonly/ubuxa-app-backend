import { Injectable } from '@nestjs/common';
// import { Prisma } from '@prisma/client';
import { Encoder, TokenTypes } from 'openpaygo';

const encoder = new Encoder();

// @Injectable()
// export class OpenPayGoService {
//   async generateToken(
//     data: Prisma.DeviceCreateInput,
//     days: number,
//     deviceCount: number,
//   ) {
//     const token = encoder.generateToken({
//       secretKeyHex: data.key,
//       count: deviceCount,
//       value: days !== -1 ? (days as number) : undefined,
//       valueDivider: Number(data.timeDivider),
//       restrictDigitSet: data.restrictedDigitMode,
//       tokenType: days === -1 ? TokenTypes.DISABLE_PAYG : TokenTypes.ADD_TIME,
//       startingCode: Number(data.startingCode),
//     });

//     return token;
//   }
// }

// Create this interface in your OpenPayGo service or a shared types file
interface TokenGenerationData {
  key: string;
  count?: string;
  timeDivider?: string;
  startingCode?: string;
  restrictedDigitMode?: boolean;
}

@Injectable()
export class OpenPayGoService {
  async generateToken(
    data: TokenGenerationData, // ✅ Use specific interface instead of DeviceCreateInput
    days: number,
    deviceCount: number,
  ) {
    const token = encoder.generateToken({
      secretKeyHex: data.key,
      count: deviceCount,
      value: days !== -1 ? (days as number) : undefined,
      valueDivider: Number(data.timeDivider),
      restrictDigitSet: data.restrictedDigitMode,
      tokenType: days === -1 ? TokenTypes.DISABLE_PAYG : TokenTypes.ADD_TIME,
      startingCode: Number(data.startingCode),
    });

    return token;
  }
}