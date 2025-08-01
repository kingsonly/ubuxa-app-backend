import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { 
  StoreAccessGuard, 
  RequireStoreAccess 
} from '../stores/guards/store-access.guard';
import { 
  StorePermissionGuard,
  RequireStorePermission 
} from '../stores/guards/store-permission.guard';
import { StoreProductsService } from './store-products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { CreateProductCategoryDto } from './dto/create-category.dto';
import { GetSessionUser } from '../auth/decorators/get-session-user.decorator';

@ApiTags('Store Products')
@ApiBearerAuth()
@Controller('store/products')
@UseGuards(JwtAuthGuard, StoreAccessGuard) // Always require authentication and store access
export class StoreProductsController {
  constructor(private readonly storeProductsService: StoreProductsService) {}

  @Post()
  @UseGuards(StorePermissionGuard)
  @RequireStoreAccess()
  @RequireStorePermission('create', 'Product')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a new product in current store' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  async create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFile() file: Express.Multer.File,
    @GetSessionUser('id') creatorId: string,
  ) {
    return this.storeProductsService.create(createProductDto, file, creatorId);
  }

  @Get()
  @RequireStoreAccess()
  @RequireStorePermission('read', 'Product')
  @ApiOperation({ summary: 'Get all products in current store' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async findAll(@Query() getProductsDto: GetProductsDto) {
    return this.storeProductsService.getAllProducts(getProductsDto);
  }

  @Get('statistics')
  @RequireStoreAccess()
  @RequireStorePermission('read', 'Product')
  @ApiOperation({ summary: 'Get product statistics for current store' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStatistics() {
    return this.storeProductsService.getProductStatistics();
  }

  @Get('categories')
  @RequireStoreAccess()
  @RequireStorePermission('read', 'Product')
  @ApiOperation({ summary: 'Get all product categories available to current store' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async getCategories() {
    return this.storeProductsService.getAllCategories();
  }

  @Post('categories')
  @UseGuards(StorePermissionGuard)
  @RequireStoreAccess()
  @RequireStorePermission('create', 'Product')
  @ApiOperation({ summary: 'Create a new product category for current store' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  async createCategory(@Body() createCategoryDto: CreateProductCategoryDto) {
    return this.storeProductsService.createProductCategory(createCategoryDto);
  }

  @Get(':id')
  @RequireStoreAccess()
  @RequireStorePermission('read', 'Product')
  @ApiOperation({ summary: 'Get a specific product from current store' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found in current store' })
  async findOne(@Param('id') id: string) {
    return this.storeProductsService.getProduct(id);
  }

  @Get(':id/tabs')
  @RequireStoreAccess()
  @RequireStorePermission('read', 'Product')
  @ApiOperation({ summary: 'Get product tabs for current store' })
  @ApiResponse({ status: 200, description: 'Product tabs retrieved successfully' })
  async getProductTabs(@Param('id') id: string) {
    return this.storeProductsService.getProductTabs(id);
  }

  @Get(':id/inventory')
  @RequireStoreAccess()
  @RequireStorePermission('read', 'StoreInventory')
  @ApiOperation({ summary: 'Get product inventory for current store' })
  @ApiResponse({ status: 200, description: 'Product inventory retrieved successfully' })
  async getProductInventory(@Param('id') id: string) {
    return this.storeProductsService.getProductInventory(id);
  }

  @Put(':id')
  @UseGuards(StorePermissionGuard)
  @RequireStoreAccess()
  @RequireStorePermission('update', 'Product')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a product in current store' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found in current store' })
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: Partial<CreateProductDto>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // Implementation would be added to StoreProductsService
    throw new Error('Update method not implemented yet');
  }

  @Delete(':id')
  @UseGuards(StorePermissionGuard)
  @RequireStoreAccess()
  @RequireStorePermission('delete', 'Product')
  @ApiOperation({ summary: 'Delete a product from current store' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found in current store' })
  async remove(@Param('id') id: string) {
    // Implementation would be added to StoreProductsService
    throw new Error('Delete method not implemented yet');
  }
}

/**
 * Usage Examples:
 * 
 * 1. Get all products in current store:
 *    GET /store/products
 *    Headers: Authorization: Bearer <token>
 *    
 * 2. Create product in current store:
 *    POST /store/products
 *    Headers: Authorization: Bearer <token>
 *    Body: { name, description, categoryId, inventories, ... }
 *    
 * 3. Get specific product from current store:
 *    GET /store/products/product-id
 *    Headers: Authorization: Bearer <token>
 *    
 * The store context is automatically determined from:
 * - JWT token (primary)
 * - Store headers (override)
 * - Store context middleware
 * 
 * All operations are automatically scoped to the user's current store.
 * Users can only see and manipulate products that belong to their store.
 */