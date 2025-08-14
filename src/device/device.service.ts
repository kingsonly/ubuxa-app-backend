import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateDeviceDto } from './dto/create-device.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { createReadStream } from 'fs';
import * as csvParser from 'csv-parser';
import { MESSAGES } from '../constants';
import { Prisma } from '@prisma/client';
import { ListDevicesQueryDto } from './dto/list-devices.dto';
import { OpenPayGoService } from '../openpaygo/openpaygo.service';
import { TenantContext } from '../tenants/context/tenant.context';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';
// import * as streamifier from 'streamifier';

import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../config/storage.provider';
import { EmailService } from '../mailer/email.service';
import { TermiiService } from '../termii/termii.service';
import { UsersService } from '../users/users.service';
import { StoreContext } from 'src/store/context/store.context';
@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openPayGo: OpenPayGoService,
    private readonly tenantContext: TenantContext,
    private readonly storeContext: StoreContext,
    private readonly storageService: StorageService,
    private readonly smsService: TermiiService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,

  ) { }


  async createDevice(createDeviceDto: CreateDeviceDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const storeId = this.storeContext.requireStoreId();

    const device = await this.fetchDevice({
      // serialNumber: createDeviceDto.serialNumber,
      serialNumber_tenantId: {
        serialNumber: createDeviceDto.serialNumber,
        tenantId
      }
    });

    if (device) throw new BadRequestException(MESSAGES.DEVICE_EXISTS);
    const {
      inventoryId, // remove this from spread
      ...rest
    } = createDeviceDto;
    return await this.prisma.device.create({
      data: {
        ...rest,
        store: { connect: { id: storeId } },
        tenant: {
          connect: { id: tenantId } // ✅ Connect to tenant relation
        },
        inventory: {
          connect: { id: inventoryId } // ✅ Connect to inventory relation
        }
      }
    });
  }



  async createBatchDeviceTokens(filePath: string) {
    // const tenantId = this.tenantContext.requireTenantId();
    // const rows = await this.parseCsv(filePath);

    // console.log({ filePath, rows })
    // const filteredRows = rows.filter(
    //   (row) => row['Serial_Number'] && row['Key'],
    // );

    // console.log({ rows });
    // const data = filteredRows.map((row) => ({
    //   serialNumber: row['Serial_Number'],
    //   key: row['Key'],
    //   count: row['Count'],
    //   timeDivider: row['Time_Divider'],
    //   firmwareVersion: row['Firmware_Version'],
    //   hardwareModel: row['Hardware_Model'],
    //   startingCode: row['Starting_Code'],
    //   restrictedDigitMode: row['Restricted_Digit_Mode'] == '1',
    //   isTokenable: row['Tokenable'] == '1',
    // }));

    // const deviceTokens = [];

    // for (const device of data) {
    //   // ✅ Create a proper structure for OpenPayGo service
    //   const deviceForToken = {
    //     key: device.key,
    //     count: device.count,
    //     timeDivider: device.timeDivider,
    //     startingCode: device.startingCode,
    //     restrictedDigitMode: device.restrictedDigitMode,
    //     tenant: {
    //       connect: { id: tenantId }
    //     }
    //   };

    //   const token = await this.openPayGo.generateToken(
    //     deviceForToken,
    //     -1,
    //     Number(device.count),
    //   );

    //   deviceTokens.push({
    //     deviceSerialNumber: device.serialNumber,
    //     deviceKey: device.key,
    //     deviceToken: token.finalToken,
    //   });
    // }

    // await this.mapDevicesToModel(filteredRows);
    // return { message: MESSAGES.CREATED, deviceTokens };
  }

  async devicesFilter(
    query: ListDevicesQueryDto,
  ): Promise<Prisma.DeviceWhereInput> {
    const tenantId = this.tenantContext.requireTenantId();

    const {
      search,
      serialNumber,
      startingCode,
      key,
      hardwareModel,
      isTokenable,
      createdAt,
      updatedAt,
      inventoryId,
      fetchFormat,
    } = query;

    // console.log({ fetchFormat });

    const filterConditions: Prisma.DeviceWhereInput = {
      AND: [
        { tenantId }, // ✅ Always include tenantId
        inventoryId
          ? { inventoryId }        // <- wrap it in an object
          : {},
        search
          ? {
            OR: [
              { serialNumber: { contains: search, mode: 'insensitive' } },
              { startingCode: { contains: search, mode: 'insensitive' } },
              { key: { contains: search, mode: 'insensitive' } },
              { hardwareModel: { contains: search, mode: 'insensitive' } },
            ],
          }
          : {},
        serialNumber
          ? { serialNumber: { contains: serialNumber, mode: 'insensitive' } }
          : {},
        startingCode
          ? { startingCode: { contains: startingCode, mode: 'insensitive' } }
          : {},
        key ? { key: { contains: key, mode: 'insensitive' } } : {},

        fetchFormat === 'used'
          ? { isUsed: true }
          : fetchFormat === 'unused'
            ? { isUsed: false }
            : {},

        hardwareModel
          ? { hardwareModel: { contains: hardwareModel, mode: 'insensitive' } }
          : {},
        isTokenable
          ? {
            isTokenable,
          }
          : {},

        createdAt
          ? {
            createdAt: {
              gte: new Date(createdAt),
              lt: new Date(new Date(createdAt).setDate(new Date(createdAt).getDate() + 1)),
            },
          }
          : {},
        updatedAt
          ? {
            updatedAt: {
              gte: new Date(updatedAt),
              lt: new Date(new Date(updatedAt).setDate(new Date(updatedAt).getDate() + 1)),
            },
          }
          : {},
      ],
    };

    return filterConditions;
  }

  async fetchDevices(query: ListDevicesQueryDto) {
    const { page = 1, limit = 100, sortField, sortOrder } = query;

    const filterConditions = await this.devicesFilter(query);

    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const orderBy = {
      [sortField || 'createdAt']: sortOrder || 'asc',
    };

    const totalCount = await this.prisma.device.count({
      where: filterConditions,
    });

    const result = await this.prisma.device.findMany({
      skip,
      take,
      // where: {},
      where: filterConditions, // ✅ Use filterConditions instead of empty object

      orderBy,
    });

    return {
      devices: result,
      total: totalCount,
      page,
      limit,
      totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
    };
  }

  async fetchDevice(fieldAndValue: Prisma.DeviceWhereUniqueInput) {

    const tenantId = this.tenantContext.requireTenantId();

    return await this.prisma.device.findUnique({
      // where: { ...fieldAndValue },
      where: {
        ...fieldAndValue,
        tenantId, // ✅ Filter by tenant
      },
      include: {
        tokens: true,
        inventory: true
      },
    });
  }

  async updateDevice(id: string, updateDeviceDto: UpdateDeviceDto) {
    const tenantId = this.tenantContext.requireTenantId();
    await this.validateDeviceExistsAndReturn({ id });


    return await this.prisma.device.update({
      where: {
        id, tenantId, // ✅ Filter by tenant
      },
      data: updateDeviceDto,
    });
  }

  async deleteDevice(id: string) {
    const tenantId = this.tenantContext.requireTenantId();
    await this.validateDeviceExistsAndReturn({ id });
    await this.prisma.device.delete({
      where: {
        id,
        tenantId, // ✅ Filter by tenant
      },
    });

    return { message: MESSAGES.DELETED };
  }

  async validateDeviceExistsAndReturn(
    fieldAndValue: Prisma.DeviceWhereUniqueInput,
  ) {
    const device = await this.fetchDevice(fieldAndValue);

    if (!device) throw new BadRequestException(MESSAGES.DEVICE_NOT_FOUND);

    return device;
  }

  // private async parseCsv(filePath: string): Promise<any[]> {
  //   return new Promise((resolve, reject) => {
  //     const results = [];
  //     createReadStream(filePath)
  //       .pipe(csvParser())
  //       .on('data', (data) => {
  //         const normalizedData = Object.keys(data).reduce((acc, key) => {
  //           const normalizedKey = key.trim().replace(/\s+/g, '_'); // Replace spaces with underscores
  //           acc[normalizedKey] = data[key];
  //           return acc;
  //         }, {});
  //         results.push(normalizedData);
  //       })
  //       .on('end', () => resolve(results))
  //       .on('error', (err) => reject(err));
  //   });
  // }

  // private async mapDevicesToModel(rows: Record<string, string>[]) {
  //   const tenantIds = this.tenantContext.requireTenantId();
  //   const data = rows.map((row) => ({
  //     serialNumber: row['Serial_Number'],
  //     deviceName: row['Device_Name'],
  //     key: row['Key'],
  //     count: row['Count'],
  //     timeDivider: row['Time_Divider'],
  //     firmwareVersion: row['Firmware_Version'],
  //     hardwareModel: row['Hardware_Model'],
  //     startingCode: row['Starting_Code'],
  //     restrictedDigitMode: row['Restricted_Digit_Mode'] == '1',
  //     isTokenable: row['Tokenable'] == '1',
  //     tenantId: tenantIds, // ✅ Include tenantId for batch operations
  //     inventoryId: row['inventoryId']
  //   }));

  //   for (const newDevice of data) {
  //     const {
  //       inventoryId,
  //       tenantId, // remove this from spread
  //       ...device
  //     } = newDevice;
  //     await this.prisma.device.upsert({
  //       where: {
  //         // serialNumber: device.serialNumber,
  //         // tenantId: device.tenantId,
  //         serialNumber_tenantId: {
  //           serialNumber: device.serialNumber,
  //           tenantId
  //         }

  //       },
  //       update: {},
  //       create: {
  //         ...device,
  //         tenant: {
  //           connect: { id: tenantId },
  //         },
  //         inventory: {
  //           connect: { id: inventoryId },
  //         }
  //         //tenantId, // ✅ Include tenantId
  //       },
  //     });
  //   }
  // }

  // ✅ Add device stats method similar to customer stats
  async getDeviceStats() {
    const tenantId = this.tenantContext.requireTenantId();

    const tokenableDeviceCount = await this.prisma.device.count({
      where: {
        tenantId,
        isTokenable: true,
      },
    });

    const usedDeviceCount = await this.prisma.device.count({
      where: {
        tenantId,
        isUsed: true,
      },
    });

    const unusedDeviceCount = await this.prisma.device.count({
      where: {
        tenantId,
        isUsed: false,
      },
    });

    const totalDeviceCount = await this.prisma.device.count({
      where: {
        tenantId,
      },
    });

    return {
      tokenableDeviceCount,
      usedDeviceCount,
      unusedDeviceCount,
      totalDeviceCount,
    };
  }

  parseCsvQueue(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results = [];
      createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => {
          const normalizedData = Object.keys(data).reduce((acc, key) => {
            const normalizedKey = key.trim().replace(/\s+/g, '_');
            acc[normalizedKey] = data[key];
            return acc;
          }, {});
          results.push(normalizedData);
        })
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  }

  async handleDeviceUpload(job) {
    const { isTokenable, restrictedDigitMode, fileKey, tenantId, inventoryId, filePath, storeId } = job.data;
    const buffer = await this.storageService.downloadFile(fileKey);
    const tmpPath = join(tmpdir(), `upload-${Date.now()}.csv`);
    writeFileSync(tmpPath, buffer);

    const rows = await this.parseCsvQueue(tmpPath);
    unlinkSync(tmpPath);
    if (isTokenable) {
      var filtered = rows.filter((r) => r['Serial_Number'] && r['Key']);
    } else {
      var filtered = rows.filter((r) => r['Serial_Number']);
    }

    const BATCH_SIZE = 100;

    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
      const batch = filtered.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (row) => {
          const device = {
            serialNumber: row['Serial_Number'],
            deviceName: row['Device_Name'],
            key: row['Key'],
            count: row['Count'],
            timeDivider: row['Time_Divider'],
            firmwareVersion: row['Firmware_Version'],
            hardwareModel: row['Hardware_Model'],
            startingCode: row['Starting_Code'],
            restrictedDigitMode: restrictedDigitMode,
            isTokenable: isTokenable,
          };

          await this.prisma.device.upsert({
            where: {
              serialNumber_tenantId: {
                serialNumber: device.serialNumber,
                tenantId,
              },
            },
            update: {},
            create: {
              ...device,
              tenant: { connect: { id: tenantId } },
              store: { connect: { id: storeId } },
              inventory: { connect: { id: inventoryId } },
            },
          });
        }),
      );
    }

    console.log(`✅ Processed ${filtered.length} devices`);
    if (fileKey) {
      try {
        await this.storageService.deleteFile(fileKey);
        console.log('🗑️ Deleted remote file:', fileKey);
      } catch (err) {
        console.error('Failed to delete remote file:', err);
      }
    }

    // 3) cleanup the original Multer file
    if (filePath) {
      try {
        unlinkSync(filePath);
        console.log('🗑️ Deleted local file:', filePath);
      } catch (err) {
        console.error('Failed to delete local file:', err);
      }
    }

  }

  async generateToken(deviceId: string, duration: number, tenantId: string, storeId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId, tenantId } });

    if (!device) throw new NotFoundException();

    // imagine you have a utility to produce a token string
    const token = await this.generateSingleDeviceToken(deviceId, duration, tenantId, storeId);

    // optionally persist the token record…
    return { token, serial: device.serialNumber, key: device.key };
  }

  async generateSingleDeviceToken(deviceId: string, tokenDuration: any, tenantId: string, storeId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId, tenantId },
    });


    if (!device) {
      throw new NotFoundException(`Device with ID ${deviceId} not found`);
    }

    if (!device.isTokenable) {
      throw new BadRequestException('This device is not tokenable');
    }


    try {
      const token = await this.openPayGo.generateToken(
        {
          key: device.key,
          timeDivider: device.timeDivider,
          restrictedDigitMode: device.restrictedDigitMode,
          startingCode: device.startingCode,
        } as any,
        tokenDuration,
        Number(device.count),
      );

      await this.prisma.device.update({
        where: { id: deviceId, tenantId },
        data: { count: String(token.newCount) },
      });
      const convertedDuration = tokenDuration === -1 ? 'Unlocked' : `${tokenDuration} days`;
      await this.prisma.tokens.create({
        data: {
          deviceId: device.id,
          storeId,
          token: String(token.finalToken),
          tenantId,
          duration: convertedDuration,
        },
      });
      console.log(`sales lets see final oh `, token);
      return {
        message: 'Token generated successfully',
        deviceId: device.id,
        deviceSerialNumber: device.serialNumber,
        //tokenId: savedToken.id,
        deviceToken: token.finalToken,
        tokenDuration:
          tokenDuration === -1 ? 'Forever' : `${tokenDuration} days`,
      };
    } catch (error) {
      //console.log("here we are main 2", token)
      console.log(error.message);
      throw new BadRequestException(
        `Failed to generate token: ${error.message}`,
      );
    }
  }

  async getName(deviceId: string) {
    return await this.prisma.device.findUnique({ where: { id: deviceId } });

  }
  async sendTokenToCustomer(data: any) {
    const { customer, token, serial, duration } = data;
    const convertedDuration = duration === -1 ? 'Unlocked' : `${duration} days`;
    const tokenData = {
      deviceSerialNumber: serial,
      deviceToken: token,
      duration: convertedDuration,
    }
    await this.smsService.sendDeviceTokensSms(
      customer.phone,
      tokenData
    );
  }

  async sendTokenToUser(data: any) {
    const { userId, token, serial, duration } = data;
    const convertedDuration = duration === -1 ? 'Unlocked' : `${duration} days`;
    const tokenData = {
      deviceSerialNumber: serial,
      deviceToken: token,
      duration: convertedDuration,
    }
    const user = await this.usersService.fetchUserByUserId(userId);
    if (user) {

      await this.emailService.sendMail({
        to: user.email,
        from: this.config.get<string>('MAIL_FROM'),
        subject: `Token Generated for ${serial}`,
        template: './send-device-tokens',
        context: {
          tokenData
        },
      });
    }


  }
  async getDeviceTokens(deviceId: string) {
    const tenantId = this.tenantContext.requireTenantId();
    try {
      const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
      if (!device) {
        throw new NotFoundException(`Device with ID ${deviceId} not found`);
      }
      const tokens = await this.prisma.tokens.findMany(
        { where: { deviceId: device.id, tenantId: tenantId } }
      );
      return tokens;
    } catch (error) {
      throw new BadRequestException(`Failed to get device tokens: ${error.message}`);
    }


  }




}
