import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import { AllocateBatchDto } from './dto/allocate-batch.dto';
import { RolesAndPermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesAndPermissionsGuard } from '../auth/guards/roles.guard';
import { ActionEnum, SubjectEnum } from '@prisma/client';
import { TenantId, StoreId } from './decorators/store.decorators';

@ApiTags('Stores')
@Controller('stores')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access_token')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.write}:${SubjectEnum.Store}`],
  })
  @ApiOperation({ summary: 'Create a new store' })
  @ApiCreatedResponse({ description: 'Store created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createStoreDto: CreateStoreDto,
    @TenantId() tenantId: string,
  ) {
    return this.storesService.createStore(tenantId, createStoreDto);
  }

  @Get()
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.read}:${SubjectEnum.Store}`],
  })
  @ApiOperation({ summary: 'Get all stores for tenant' })
  @ApiOkResponse({ description: 'Stores retrieved successfully' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(@TenantId() tenantId: string) {
    return this.storesService.findAllByTenant(tenantId);
  }

  @Get(':id')
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.read}:${SubjectEnum.Store}`],
  })
  @ApiOperation({ summary: 'Get store by ID' })
  @ApiOkResponse({ description: 'Store retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Store not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.storesService.findOne(id, tenantId);
  }

  @Put(':id')
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.write}:${SubjectEnum.Store}`],
  })
  @ApiOperation({ summary: 'Update store' })
  @ApiOkResponse({ description: 'Store updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiNotFoundResponse({ description: 'Store not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async update(
    @Param('id') id: string,
    @Body() updateStoreDto: UpdateStoreDto,
    @TenantId() tenantId: string,
  ) {
    return this.storesService.update(id, tenantId, updateStoreDto);
  }

  @Delete(':id')
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.delete}:${SubjectEnum.Store}`],
  })
  @ApiOperation({ summary: 'Delete store' })
  @ApiOkResponse({ description: 'Store deleted successfully' })
  @ApiNotFoundResponse({ description: 'Store not found' })
  @ApiBadRequestResponse({ description: 'Cannot delete main store' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @TenantId() tenantId: string) {
    await this.storesService.remove(id, tenantId);
  }

  @Post(':id/assign-user')
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.write}:${SubjectEnum.Store}`],
  })
  @ApiOperation({ summary: 'Assign user to store' })
  @ApiOkResponse({ description: 'User assigned to store successfully' })
  @ApiBadRequestResponse({ description: 'Invalid user or store' })
  @ApiNotFoundResponse({ description: 'User or store not found' })
  @ApiForbiddenResponse({ description: 'User does not belong to same tenant' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async assignUser(
    @Param('id') storeId: string,
    @Body() assignUserDto: AssignUserDto,
    @TenantId() tenantId: string,
  ) {
    return this.storesService.assignUserToStore(assignUserDto.userId, storeId);
  }

  @Get(':id/users')
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.read}:${SubjectEnum.Store}`],
  })
  @ApiOperation({ summary: 'Get users assigned to store' })
  @ApiOkResponse({ description: 'Store users retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Store not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getStoreUsers(@Param('id') storeId: string, @TenantId() tenantId: string) {
    return this.storesService.getStoreUsers(storeId);
  }

  @Post(':id/allocate-batch')
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.write}:${SubjectEnum.Store}`, `${ActionEnum.write}:${SubjectEnum.Inventory}`],
  })
  @ApiOperation({ summary: 'Allocate inventory batch to store' })
  @ApiCreatedResponse({ description: 'Batch allocated to store successfully' })
  @ApiBadRequestResponse({ description: 'Insufficient batch quantity or invalid data' })
  @ApiNotFoundResponse({ description: 'Store or batch not found' })
  @ApiForbiddenResponse({ description: 'Batch and store must belong to same tenant' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  async allocateBatch(
    @Param('id') storeId: string,
    @Body() allocateBatchDto: AllocateBatchDto,
    @TenantId() tenantId: string,
  ) {
    return this.storesService.allocateBatchToStore(
      allocateBatchDto.batchId,
      storeId,
      allocateBatchDto.quantity,
    );
  }

  @Get(':id/batches')
  @UseGuards(RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.read}:${SubjectEnum.Store}`, `${ActionEnum.read}:${SubjectEnum.Inventory}`],
  })
  @ApiOperation({ summary: 'Get batch allocations for store' })
  @ApiOkResponse({ description: 'Store batch allocations retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Store not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getStoreBatches(@Param('id') storeId: string, @TenantId() tenantId: string) {
    return this.storesService.getStoreBatchAllocations(storeId);
  }
}