import { BadRequestException, Injectable } from '@nestjs/common';
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

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openPayGo: OpenPayGoService,
    private readonly tenantContext: TenantContext,
  ) {}

  async uploadBatchDevices(filePath: string) {
    const rows = await this.parseCsv(filePath);

    const filteredRows = rows.filter(
      (row) => row['Serial_Number'] && row['Key'],
    );

    await this.mapDevicesToModel(filteredRows);
    return { message: MESSAGES.CREATED };
  }

  async createDevice(createDeviceDto: CreateDeviceDto) {
    const tenantId = this.tenantContext.requireTenantId();

    const device = await this.fetchDevice({
      // serialNumber: createDeviceDto.serialNumber,
      serialNumber_tenantId: {
        serialNumber: createDeviceDto.serialNumber,
        tenantId
      }
    });

    if (device) throw new BadRequestException(MESSAGES.DEVICE_EXISTS);

    return await this.prisma.device.create({
      data: {
        ...createDeviceDto,
        // tenantId, // ✅ Include tenantId
        tenant: {
          connect: { id: tenantId } // ✅ Connect to tenant relation
        }
      }
    });
  }

  // async createBatchDeviceTokens(filePath: string) {
  //   const tenantId = this.tenantContext.requireTenantId();
  //   const rows = await this.parseCsv(filePath);

  //   console.log({filePath, rows})
  //   const filteredRows = rows.filter(
  //     (row) => row['Serial_Number'] && row['Key'],
  //   );

  //   console.log({ rows });
  //   const data = filteredRows.map((row) => ({
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
  //     tenantId, // ✅ Include tenantId for batch operations
  //   }));

  //   const deviceTokens = [];

  //   for (const device of data) {
  //     const token = await this.openPayGo.generateToken(
  //       device,
  //       -1,
  //       Number(device.count),
  //     );

  //     deviceTokens.push({
  //       deviceSerialNumber: device.serialNumber,
  //       deviceKey: device.key,
  //       deviceToken: token.finalToken,
  //     });
  //   }

  //   await this.mapDevicesToModel(filteredRows);
  //   return { message: MESSAGES.CREATED, deviceTokens };
  // }

  async createBatchDeviceTokens(filePath: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const rows = await this.parseCsv(filePath);

    console.log({filePath, rows})
    const filteredRows = rows.filter(
      (row) => row['Serial_Number'] && row['Key'],
    );

    console.log({ rows });
    const data = filteredRows.map((row) => ({
      serialNumber: row['Serial_Number'],
      key: row['Key'],
      count: row['Count'],
      timeDivider: row['Time_Divider'],
      firmwareVersion: row['Firmware_Version'],
      hardwareModel: row['Hardware_Model'],
      startingCode: row['Starting_Code'],
      restrictedDigitMode: row['Restricted_Digit_Mode'] == '1',
      isTokenable: row['Tokenable'] == '1',
    }));

    const deviceTokens = [];

    for (const device of data) {
      // ✅ Create a proper structure for OpenPayGo service
      const deviceForToken = {
        key: device.key,
        count: device.count,
        timeDivider: device.timeDivider,
        startingCode: device.startingCode,
        restrictedDigitMode: device.restrictedDigitMode,
        tenant: {
          connect: { id: tenantId }
        }
      };

      const token = await this.openPayGo.generateToken(
        deviceForToken,
        -1,
        Number(device.count),
      );

      deviceTokens.push({
        deviceSerialNumber: device.serialNumber,
        deviceKey: device.key,
        deviceToken: token.finalToken,
      });
    }

    await this.mapDevicesToModel(filteredRows);
    return { message: MESSAGES.CREATED, deviceTokens };
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
      fetchFormat,
    } = query;

    // console.log({ fetchFormat });

    const filterConditions: Prisma.DeviceWhereInput = {
      AND: [
        { tenantId }, // ✅ Always include tenantId
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

        // fetchFormat === 'used'
        //   ? { isUsed: true }
        //   : fetchFormat === 'unused'
        //     ? { isUsed: false }
        //     : {},

        hardwareModel
          ? { hardwareModel: { contains: hardwareModel, mode: 'insensitive' } }
          : {},
        isTokenable
          ? {
              isTokenable,
            }
          : {},
        createdAt ? { createdAt: { gte: new Date(createdAt) } } : {},
        updatedAt ? { updatedAt: { gte: new Date(updatedAt) } } : {},
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
      },
    });
  }

  async updateDevice(id: string, updateDeviceDto: UpdateDeviceDto) {
    const tenantId = this.tenantContext.requireTenantId();
    await this.validateDeviceExistsAndReturn({ id });


    return await this.prisma.device.update({
      where: { id ,  tenantId, // ✅ Filter by tenant
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

  private async parseCsv(filePath: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results = [];
      createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => {
          const normalizedData = Object.keys(data).reduce((acc, key) => {
            const normalizedKey = key.trim().replace(/\s+/g, '_'); // Replace spaces with underscores
            acc[normalizedKey] = data[key];
            return acc;
          }, {});
          results.push(normalizedData);
        })
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  }

  private async mapDevicesToModel(rows: Record<string, string>[]) {
    const tenantId = this.tenantContext.requireTenantId();
    const data = rows.map((row) => ({
      serialNumber: row['Serial_Number'],
      deviceName: row['Device_Name'],
      key: row['Key'],
      count: row['Count'],
      timeDivider: row['Time_Divider'],
      firmwareVersion: row['Firmware_Version'],
      hardwareModel: row['Hardware_Model'],
      startingCode: row['Starting_Code'],
      restrictedDigitMode: row['Restricted_Digit_Mode'] == '1',
      isTokenable: row['Tokenable'] == '1',
      tenantId, // ✅ Include tenantId for batch operations
    }));

    for (const device of data) {
      await this.prisma.device.upsert({
        where: {
          // serialNumber: device.serialNumber,
          // tenantId: device.tenantId,
          serialNumber_tenantId: {
            serialNumber: device.serialNumber,
            tenantId
          }

        },
        update: {},
        create: {
          ...device,
          tenantId, // ✅ Include tenantId
         },
      });
    }
  }

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
}
