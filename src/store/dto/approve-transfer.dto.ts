import { IsEnum, IsOptional, IsNumber, IsString, Min } from 'class-validator';

export class ApproveTransferDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsNumber()
  @Min(1)
  approvedQuantity?: number;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
