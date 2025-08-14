import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpStatus,
  HttpCode,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreResponseDto } from './dto/store-response.dto';
import { StoreUserResponseDto } from './dto/store-user-response.dto';
import { GetStoresDto } from './dto/get-stores.dto';
import { GetUsersDto } from './dto/get-users.dto';
import { GetSessionUser } from '../auth/decorators/getUser';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { ActionEnum, SubjectEnum, Store } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { RolesAndPermissionsGuard } from '../auth/guards/roles.guard';
import { RolesAndPermissions } from '../auth/decorators/roles.decorator';
import { PaginatedResult } from '../utils/dto/pagination.dto';

@SkipThrottle()
@ApiTags('Stores')
@ApiBearerAuth('access_token')
@ApiHeader({
  name: 'Authorization',
  description: 'JWT token used for authentication',
  required: true,
  schema: {
    type: 'string',
    example: 'Bearer <token>',
  },
})
@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Post()
  @ApiOperation({
    summary: 'Create a new store',
    description: 'Creates a new store within the current tenant context',
  })
  @ApiBody({ type: CreateStoreDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Store created successfully',
    type: StoreResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or business rule violation',
  })
  @HttpCode(HttpStatus.CREATED)
  async createStore(@Body() createStoreDto: CreateStoreDto) {
    return this.storeService.createStore(createStoreDto);
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get()
  @ApiOperation({
    summary: 'Get all stores with pagination and filtering',
    description:
      'Retrieves stores for the current tenant with pagination, search, and filtering capabilities',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of stores retrieved successfully',
    type: PaginatedResult<StoreResponseDto>,
  })
  async findAllStores(
    @Query() query: GetStoresDto,
  ): Promise<PaginatedResult<Store>> {
    return this.storeService.findAllByTenantPaginated(query);
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get('unassigned-users')
  @ApiOperation({
    summary: 'Get unassigned users',
    description: 'Retrieves users in tenant that are not assigned to any store',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Unassigned users retrieved successfully',
    type: PaginatedResult<StoreUserResponseDto>,
  })
  async getUnassignedUsers(@Query() query: GetUsersDto) {
    return this.storeService.getUnassignedUsers(query);
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get('main')
  @ApiOperation({
    summary: 'Get main store',
    description: 'Retrieves the main store for the current tenant',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Main store retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Main store not found',
  })
  async findMainStore() {
    return this.storeService.findMainStore();
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get(':id')
  @ApiOperation({
    summary: 'Get store by ID',
    description: 'Retrieves a specific store by its ID',
  })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Store retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store not found',
  })
  async findOneStore(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get(':id/users')
  @ApiOperation({
    summary: 'Get store users with pagination',
    description:
      'Retrieves users assigned to a specific store with pagination and filtering',
  })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated store users retrieved successfully',
    type: PaginatedResult<StoreUserResponseDto>,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store not found',
  })
  async getStoreUsers(
    @Param('id') storeId: string,
    @Query() query: GetUsersDto,
  ) {
    return this.storeService.getStoreUsers(storeId, query);
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Patch(':id')
  @ApiOperation({
    summary: 'Update store',
    description: 'Updates a store with new information',
  })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiBody({ type: UpdateStoreDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Store updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or business rule violation',
  })
  async updateStore(
    @Param('id') id: string,
    @Body() updateStoreDto: UpdateStoreDto,
  ) {
    return this.storeService.update(id, updateStoreDto);
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete store',
    description: 'Soft deletes a store (sets deletedAt timestamp)',
  })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Store deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot delete store due to business rules',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStore(@Param('id') id: string) {
    await this.storeService.remove(id);
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Delete('unassign-user/:userId')
  @ApiOperation({
    summary: 'Unassign user from store',
    description: 'Removes user assignment from any store',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User unassigned successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async unassignUserFromStore(@Param('userId') userId: string) {
    return this.storeService.unassignUserFromStore(userId);
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  // User assignment endpoints
  @Post(':storeId/assign-user/:userId')
  @ApiOperation({
    summary: 'Assign user to store',
    description: 'Assigns a user to a specific store within the tenant context',
  })
  @ApiParam({ name: 'storeId', description: 'Store ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User assigned to store successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store or user not found',
  })
  async assignUserToStore(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
  ) {
    return this.storeService.assignUserToStore(userId, storeId);
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get user assigned store',
    description: 'Retrieves the store assigned to a specific user',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User store retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found or no store assigned',
  })
  async getUserStore(@Param('userId') userId: string) {
    return this.storeService.getUserStore(userId);
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get('user/me/store')
  @ApiOperation({
    summary: 'Get current user assigned store',
    description:
      'Retrieves the store assigned to the current authenticated user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current user store retrieved successfully',
  })
  async getCurrentUserStore(@GetSessionUser('id') userId: string) {
    return this.storeService.getUserStore(userId);
  }
  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Store}`],
  })
  @Get('user/:userId/default')
  @ApiOperation({
    summary: 'Get user default store',
    description: 'Retrieves the default store for a user (fallback logic)',
  })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User default store retrieved successfully',
  })
  async getUserDefaultStore(@Param('userId') userId: string) {
    const storeId = await this.storeService.getUserDefaultStore(userId);
    return { storeId };
  }
}
