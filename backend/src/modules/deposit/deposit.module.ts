import { Module } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { HoldExpiryService } from './hold-expiry.service';
import { DepositController } from './deposit.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [PrismaModule, AuditModule, AuthModule, TenantModule],
  controllers: [DepositController],
  providers: [DepositService, HoldExpiryService],
  exports: [DepositService, HoldExpiryService],
})
export class DepositModule {}
