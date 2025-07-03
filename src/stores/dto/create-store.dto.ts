import { ApiProperty } from "@nestjs/swagger";
import { StoreType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString, MinLength } from "class-validator";

export class CreateStoreDto {
    @ApiProperty({ example: 'Main Store', description: 'Store Name' })
    @IsNotEmpty()
    @IsString()
    @MinLength(3)
    name: string;

    @ApiProperty({ example: StoreType.MAIN, description: 'Store Type', enum: StoreType })
    @IsNotEmpty()
    @IsString()
    @IsEnum(StoreType)
    type: StoreType;

    // @ApiProperty({ example: '681b5f6042025a21a4cc3c4c', description: 'Tenant Id' })
    // @IsNotEmpty()
    // @IsString()
    // @IsObjectId()
    // tenantId: string;

    // @ApiProperty({ example: '681b5f6042025a21a4cc3c4c', description: 'Parent Store Id' })
    // @IsOptional()
    // @IsString()
    // @IsObjectId()
    // parentId?: string;
}