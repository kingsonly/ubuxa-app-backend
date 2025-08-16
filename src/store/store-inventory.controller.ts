import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import {
  StoreInventoryService,
  StoreInventoryView,
} from './store-inventory.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { ApproveTransferDto } from './dto/approve-transfer.dto';
import {
  TransferRequestResponseDto,
  PendingRequestsQueryDto,
} from './dto/transfer-request-response.dto';
import { StoreInventoryViewDto } from './dto/store-inventory-view.dto';
import { GetSessionUser } from '../auth/decorators/getUser';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { ActionEnum, SubjectEnum } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { RolesAndPermissionsGuard } from '../auth/guards/roles.guard';
import { RolesAndPermissions } from '../auth/decorators/roles.decorator';

@SkipThrottle()
@ApiTags('Store Inventory')
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
export class StoreInventoryController {
  constructor(private readonly storeInventoryService: StoreInventoryService) {}

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Inventory}`],
  })
  @Get(':storeId/inventory')
  @ApiOperation({
    summary: 'Get store inventory view',
    description:
      'Retrieves inventory batches with store-specific allocation details for a given store',
  })
  @ApiParam({
    name: 'storeId',
    description: 'Store ID to get inventory view for',
    type: 'string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Store inventory view retrieved successfully',
    type: [StoreInventoryViewDto],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied to store inventory',
  })
  async getStoreInventory(
    @Param('storeId') storeId: string,
  ): Promise<StoreInventoryView[]> {
    return this.storeInventoryService.getStoreInventoryView(storeId);
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Inventory}`],
  })
  @Post(':storeId/transfer-requests')
  @ApiOperation({
    summary: 'Create transfer request',
    description:
      'Creates a new inventory batch transfer request from the specified store',
  })
  @ApiParam({
    name: 'storeId',
    description: 'Store ID creating the transfer request',
    type: 'string',
  })
  @ApiBody({ type: CreateTransferRequestDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Transfer request created successfully',
    schema: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string',
          description: 'ID of the created transfer request',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request data or business rule violation',
    schema: {
      oneOf: [
        {
          properties: {
            error: { type: 'string', example: 'INVALID_TRANSFER_REQUEST' },
            message: { type: 'string', example: 'User ID is required' },
          },
        },
        {
          properties: {
            error: { type: 'string', example: 'INSUFFICIENT_STORE_ALLOCATION' },
            message: {
              type: 'string',
              example:
                'Insufficient inventory allocation for store. Requested: 10, Available: 5',
            },
            storeId: { type: 'string' },
            batchId: { type: 'string' },
            requested: { type: 'number' },
            available: { type: 'number' },
          },
        },
        {
          properties: {
            error: { type: 'string', example: 'TRANSFER_REQUEST_CONFLICT' },
            message: {
              type: 'string',
              example:
                'A pending transfer request already exists for this batch from the same store',
            },
            conflictingRequestId: { type: 'string' },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store or inventory batch not found',
    schema: {
      oneOf: [
        {
          properties: {
            error: { type: 'string', example: 'STORE_NOT_FOUND' },
            message: {
              type: 'string',
              example: 'Store with ID store-123 not found',
            },
            storeId: { type: 'string' },
          },
        },
        {
          properties: {
            error: { type: 'string', example: 'INVENTORY_BATCH_NOT_FOUND' },
            message: {
              type: 'string',
              example: 'Inventory batch with ID batch-123 not found',
            },
            batchId: { type: 'string' },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied to create transfer request',
    schema: {
      properties: {
        error: { type: 'string', example: 'STORE_ACCESS_DENIED' },
        message: {
          type: 'string',
          example: 'Access denied for store operation: create transfer request',
        },
        storeId: { type: 'string' },
        action: { type: 'string' },
      },
    },
  })
  @HttpCode(HttpStatus.CREATED)
  async createTransferRequest(
    @Param('storeId') storeId: string,
    @Body() createTransferRequestDto: CreateTransferRequestDto,
    @GetSessionUser('id') userId: string,
  ): Promise<{ requestId: string }> {
    const requestId = await this.storeInventoryService.createTransferRequest(
      createTransferRequestDto,
      userId,
    );
    return { requestId };
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Inventory}`],
  })
  @Put('transfer-requests/:requestId/approve')
  @ApiOperation({
    summary: 'Approve or reject transfer request',
    description:
      'Approves or rejects a pending transfer request with optional quantity modification',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Transfer request ID to approve or reject',
    type: 'string',
  })
  @ApiBody({ type: ApproveTransferDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transfer request approval processed successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid approval data or business rule violation',
    schema: {
      oneOf: [
        {
          properties: {
            error: { type: 'string', example: 'INVALID_TRANSFER_REQUEST' },
            message: {
              type: 'string',
              example: 'Approved quantity must be positive',
            },
          },
        },
        {
          properties: {
            error: {
              type: 'string',
              example: 'INVALID_TRANSFER_REQUEST_STATE',
            },
            message: {
              type: 'string',
              example:
                'Cannot perform approve on transfer request in state APPROVED. Required state: PENDING',
            },
            requestId: { type: 'string' },
            currentState: { type: 'string' },
            requiredState: { type: 'string' },
            operation: { type: 'string' },
          },
        },
        {
          properties: {
            error: { type: 'string', example: 'INSUFFICIENT_STORE_ALLOCATION' },
            message: {
              type: 'string',
              example:
                'Insufficient inventory allocation for store. Requested: 10, Available: 5',
            },
            storeId: { type: 'string' },
            batchId: { type: 'string' },
            requested: { type: 'number' },
            available: { type: 'number' },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transfer request not found',
    schema: {
      properties: {
        error: { type: 'string', example: 'TRANSFER_REQUEST_NOT_FOUND' },
        message: {
          type: 'string',
          example: 'Transfer request with ID request-123 not found',
        },
        requestId: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied to approve transfer request',
    schema: {
      properties: {
        error: { type: 'string', example: 'STORE_ACCESS_DENIED' },
        message: {
          type: 'string',
          example:
            'Access denied for store operation: approve transfer request',
        },
        storeId: { type: 'string' },
        action: { type: 'string' },
        userId: { type: 'string' },
      },
    },
  })
  async approveTransferRequest(
    @Param('requestId') requestId: string,
    @Body() approveTransferDto: ApproveTransferDto,
    @GetSessionUser('id') userId: string,
  ): Promise<void> {
    await this.storeInventoryService.approveTransferRequest(
      requestId,
      approveTransferDto,
      userId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Inventory}`],
  })
  @Put('transfer-requests/:requestId/confirm')
  @ApiOperation({
    summary: 'Confirm approved transfer request',
    description:
      'Confirms an approved transfer request and executes the inventory allocation transfer',
  })
  @ApiParam({
    name: 'requestId',
    description: 'Transfer request ID to confirm',
    type: 'string',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Transfer request confirmed and allocation transfer completed successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid confirmation or business rule violation',
    schema: {
      oneOf: [
        {
          properties: {
            error: { type: 'string', example: 'INVALID_TRANSFER_REQUEST' },
            message: { type: 'string', example: 'User ID is required' },
          },
        },
        {
          properties: {
            error: {
              type: 'string',
              example: 'INVALID_TRANSFER_REQUEST_STATE',
            },
            message: {
              type: 'string',
              example:
                'Cannot perform confirm on transfer request in state PENDING. Required state: APPROVED',
            },
            requestId: { type: 'string' },
            currentState: { type: 'string' },
            requiredState: { type: 'string' },
            operation: { type: 'string' },
          },
        },
        {
          properties: {
            error: { type: 'string', example: 'INSUFFICIENT_STORE_ALLOCATION' },
            message: {
              type: 'string',
              example:
                'Insufficient inventory allocation for store. Requested: 10, Available: 5',
            },
            storeId: { type: 'string' },
            batchId: { type: 'string' },
            requested: { type: 'number' },
            available: { type: 'number' },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transfer request not found',
    schema: {
      properties: {
        error: { type: 'string', example: 'TRANSFER_REQUEST_NOT_FOUND' },
        message: {
          type: 'string',
          example: 'Transfer request with ID request-123 not found',
        },
        requestId: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied to confirm transfer request',
    schema: {
      properties: {
        error: { type: 'string', example: 'STORE_ACCESS_DENIED' },
        message: {
          type: 'string',
          example:
            'Access denied for store operation: confirm transfer request',
        },
        storeId: { type: 'string' },
        action: { type: 'string' },
        userId: { type: 'string' },
      },
    },
  })
  async confirmTransferRequest(
    @Param('requestId') requestId: string,
    @GetSessionUser('id') userId: string,
  ): Promise<void> {
    await this.storeInventoryService.confirmTransferRequest(requestId, userId);
  }

  @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
  @RolesAndPermissions({
    permissions: [`${ActionEnum.manage}:${SubjectEnum.Inventory}`],
  })
  @Get(':storeId/transfer-requests')
  @ApiOperation({
    summary: 'Get transfer requests for store',
    description:
      'Retrieves transfer requests related to a specific store with optional filtering',
  })
  @ApiParam({
    name: 'storeId',
    description: 'Store ID to get transfer requests for',
    type: 'string',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'],
    description: 'Filter by request status',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['ALLOCATION', 'TRANSFER'],
    description: 'Filter by request type',
  })
  @ApiQuery({
    name: 'sourceStoreId',
    required: false,
    type: 'string',
    description: 'Filter by source store ID',
  })
  @ApiQuery({
    name: 'targetStoreId',
    required: false,
    type: 'string',
    description: 'Filter by target store ID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transfer requests retrieved successfully',
    type: [TransferRequestResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Store not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied to view transfer requests',
  })
  async getStoreTransferRequests(
    @Param('storeId') storeId: string,
    @Query() query: PendingRequestsQueryDto,
  ): Promise<TransferRequestResponseDto[]> {
    return this.storeInventoryService.getPendingRequests(storeId, query);
  }
}
