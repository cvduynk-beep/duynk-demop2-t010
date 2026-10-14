import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DispatchAssignerService } from './dispatch-assigner.service';
import { DispatchSlaService } from './dispatch-sla.service';

/** Hồ sơ 15: bộ chọn Sale (dùng chung) + sweep giao lại ca quá SLA 3′ (2026-10-14). Route `/dispatch/*` giả đã xoá — cổng Sale ở `/host/*` (host-viewings). */
@Module({
  imports: [PrismaModule],
  providers: [DispatchAssignerService, DispatchSlaService],
  exports: [DispatchAssignerService, DispatchSlaService],
})
export class DispatchModule {}
