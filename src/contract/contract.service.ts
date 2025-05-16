import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalesDto } from '../sales/dto/create-sales.dto';
import { PaginationQueryDto } from '../utils/dto/pagination.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { TenantContext } from '../tenants/context/tenant.context';

@Injectable()
export class ContractService {
  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,

  ) {}

  async createContract(dto: CreateSalesDto, initialAmountPaid: number) {
    const tenantId = this.tenantContext.requireTenantId();

    return await this.prisma.contract.create({
      data: {
        // tenant: {
        //   connect: {
        //     id: tenantId,
        //   },
        // },
        tenantId , // ✅ Always include tenantId
        initialAmountPaid,
        nextOfKinFullName: dto.nextOfKinDetails.fullName,
        nextOfKinRelationship: dto.nextOfKinDetails.relationship,
        nextOfKinPhoneNumber: dto.nextOfKinDetails.phoneNumber,
        nextOfKinHomeAddress: dto.nextOfKinDetails.homeAddress,
        nextOfKinEmail: dto.nextOfKinDetails.email,
        nextOfKinDateOfBirth: dto.nextOfKinDetails.dateOfBirth,
        nextOfKinNationality: dto.nextOfKinDetails.nationality,
        guarantorFullName: dto.guarantorDetails.fullName,
        guarantorPhoneNumber: dto.guarantorDetails.phoneNumber,
        guarantorHomeAddress: dto.guarantorDetails.homeAddress,
        guarantorEmail: dto.guarantorDetails.email,
        guarantorIdType: dto.guarantorDetails.identificationDetails.idType,
        guarantorIdNumber: dto.guarantorDetails.identificationDetails.idNumber,
        guarantorIdIssuingCountry:
          dto.guarantorDetails.identificationDetails.issuingCountry,
        guarantorIdIssueDate:
          dto.guarantorDetails.identificationDetails.issueDate,
        guarantorIdExpirationDate:
          dto.guarantorDetails.identificationDetails.expirationDate,
        guarantorNationality: dto.guarantorDetails.nationality,
        guarantorDateOfBirth: dto.guarantorDetails.dateOfBirth,
        idType: dto.identificationDetails.idType,
        idNumber: dto.identificationDetails.idNumber,
        issuingCountry: dto.identificationDetails.issuingCountry,
        issueDate: dto.identificationDetails.issueDate,
        expirationDate: dto.identificationDetails.expirationDate,
        fullNameAsOnID: dto.identificationDetails.fullNameAsOnID,
        addressAsOnID: dto.identificationDetails.addressAsOnID,
      },
    });
  }

  async getAllContracts(query: PaginationQueryDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const { page = 1, limit = 100 } = query;
    const pageNumber = parseInt(String(page), 10);
    const limitNumber = parseInt(String(limit), 10);

    const skip = (pageNumber - 1) * limitNumber;
    const take = limitNumber;

    const totalCount = await this.prisma.contract.count({
      where: {
        tenantId, // ✅ Filter by tenantId

        sale: {
          some: {},
        },
      },
    });

    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId, // ✅ Filter by tenantId

        sale: {
          some: {},
        },
      },
      include: {
        sale: {
          include: {
            customer: true,
            saleItems: {
              include: {
                product: {
                  include: {
                    inventories: {
                      include: {
                        inventory: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      skip,
      take,
    });

    return {
      contracts,
      total: totalCount,
      page,
      limit,
      totalPages: limitNumber === 0 ? 0 : Math.ceil(totalCount / limitNumber),
    };
  }

  async getContract(id: string) {
    const tenantId = this.tenantContext.requireTenantId();

    const contract = await this.prisma.contract.findUnique({
      where: {
        id,
        tenantId, // ✅ Filter by tenantId

      },
      include: {
        sale: {

          // where: { tenantId },
          include: {
            customer: true,
            saleItems: {
              // where: { tenantId },

              include: {
                SaleRecipient: true,
                // SaleRecipient: { where: { tenantId } }, // SaleRecipient should be tenanted

                product: {
                  include: {
                    inventories: {
                      include: {
                        inventory: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!contract) return new BadRequestException(`Contract ${id} not found`);

    return contract;
  }

  async uploadSignage(id: string, file: Express.Multer.File) {
    const tenantId = this.tenantContext.requireTenantId();

    const contract = await this.prisma.contract.findUnique({
      where: {
        id,
        tenantId, // ✅ Filter by tenantId

      },
    });

    if (!contract) return new BadRequestException(`Contract ${id} not found`);
    if (contract.signedContractUrl)
      return new BadRequestException(`Contract ${id} already signed`);

    const signedContractUrl = (await this.uploadContractSignage(file))
      .secure_url;

    await this.prisma.contract.update({
      where: {
        id,
        tenantId, // ✅ Filter by tenantId

      },
      data: {
        signedContractUrl,
        signedAt: new Date(),
      },
    });
  }

  private async uploadContractSignage(file: Express.Multer.File) {
    return await this.cloudinary.uploadFile(file).catch((e) => {
      throw e;
    });
  }
}
