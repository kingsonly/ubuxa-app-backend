import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SubjectEnum } from '@prisma/client';
import { ObjectId } from 'mongodb';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  // Helper function to validate MongoDB ObjectId
  private isValidObjectId(id: string): boolean {
    return ObjectId.isValid(id);
  }

  // Create a new permission
  async create(createPermissionDto: CreatePermissionDto) {
    const existingPermission = await this.prisma.permission.findFirst({
      where: {
        action: createPermissionDto.action,
        subject: createPermissionDto.subject,
      },
    });

    if (existingPermission) {
      throw new BadRequestException(
        'Permission with the same action and subject already exists.',
      );
    }

    return this.prisma.permission.create({
      data: {
        action: createPermissionDto.action,
        subject: createPermissionDto.subject,
      },
    });
  }

  // Get all permissions
  async findAll() {
    return this.prisma.permission.findMany();
  }

  // Get all permission subjects
  async findAllPermissionSubjects() {
    const hiddenSubjects: SubjectEnum[] = [SubjectEnum.all, SubjectEnum.User];

    const subjects = Object.values(SubjectEnum).filter(
      (subject) => !hiddenSubjects.includes(subject),
    );

    return { subjects };
  }

  // Get one permission by ID
  async findOne(id: string) {
    // Validate ObjectId
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid permission ID: ${id}`);
    }

    const existingPermission = await this.prisma.permission.findUnique({
      where: { id: String(id) },
    });

    if (!existingPermission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    return existingPermission;
  }

  // Update permission by ID
  async update(id: string, updatePermissionDto: UpdatePermissionDto) {
    // Validate ObjectId
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid permission ID: ${id}`);
    }

    const existingPermission = await this.prisma.permission.findUnique({
      where: { id: String(id) },
    });

    if (!existingPermission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    const updateData: Prisma.PermissionUpdateInput = {};

    if (updatePermissionDto.action) {
      updateData.action = updatePermissionDto.action;
    }
    if (updatePermissionDto.subject) {
      updateData.subject = updatePermissionDto.subject;
    }

    const updatedPermission = await this.prisma.permission.update({
      where: { id: String(id) },
      data: updateData,
    });

    return {
      message: `Permission with ID ${id} updated successfully`,
      data: updatedPermission,
    };
  }

  // Delete permission by ID
  async remove(id: string) {
    // Validate ObjectId
    if (!this.isValidObjectId(id)) {
      throw new BadRequestException(`Invalid permission ID: ${id}`);
    }

    const existingPermission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!existingPermission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }

    await this.prisma.permission.delete({
      where: { id },
    });

    return {
      message: 'Permission deleted successfully',
    };
  }
}
