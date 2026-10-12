import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { LeasePdfService } from './lease-pdf.service';
import { AuthModule } from '../auth/auth.module';
import { DoorModule } from '../door/door.module';
import { DepositModule } from '../deposit/deposit.module';
import { TenantModule } from '../tenant/tenant.module';
import { LeaseSigningService } from './lease-signing.service';

@Module({
  imports: [AuthModule, DoorModule, DepositModule, TenantModule],
  controllers: [ContractController],
  providers: [ContractService, LeasePdfService, LeaseSigningService],
  exports: [ContractService, LeasePdfService],
})
export class ContractModule {}
