import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DoorLockType, MandateStatus, Prisma } from '@prisma/client';
import { DoorCodeService } from '../door/door-code.service';
import { AuditService } from '../audit/audit.service';
import { ConsignmentMetaStore } from '../landlord/consignment-meta.store';
import { ConsignmentMeta, PricingProposal, consignmentStage } from '../landlord/landlord.mappers';
import { LISTING_PHOTOS_MIN } from './inspection.constants';
import { inspectionBadStage } from './inspection.errors';
import { mutateInspection } from './inspection.helpers';
import { originalPricing, pricingChanged } from './inspection-report.validator';
import { ListingPublisher } from './listing-publisher.service';

export interface ReviewActor {
  profileId: string;
}

export interface ReviewResult {
  stage: 'approved' | 'awaiting_landlord' | 'rejected';
  unitCode: string;
  listedAt: string | null;
}

/** Phiếu `reviewing` thiếu dữ liệu để niêm yết (hồ sơ cũ / Inspector không điền) ⇒ Admin chỉ còn cách từ chối. */
const reviewIncomplete = (message: string) => new ConflictException({ message, code: 'review_incomplete' });

/**
 * Admin quyết hồ sơ ký gửi Inspector đề xuất KHÔNG duyệt (stage `reviewing` — căn bất thường: giá thuê quá cao, nội thất
 * sai hiện trạng…). Căn bình thường Inspector tự niêm yết, KHÔNG qua đây.
 *
 * - Duyệt: niêm yết theo đúng phiếu (facts, ảnh niêm yết, giá). Giá/cọc trên phiếu khác chủ khai ⇒ `awaiting_landlord`
 *   (chủ nhà đồng ý giá rồi mới niêm yết — giữ nguyên quy tắc hồ sơ 18), ngược lại niêm yết ngay.
 * - Từ chối: chấm dứt ủy quyền, lý do gửi chủ nhà; ảnh giữ làm bằng chứng.
 */
@Injectable()
export class ConsignmentReviewService {
  private readonly logger = new Logger(ConsignmentReviewService.name);

  constructor(
    private readonly store: ConsignmentMetaStore,
    private readonly doors: DoorCodeService,
    private readonly publisher: ListingPublisher,
    private readonly audit: AuditService,
  ) {}

  async approve(actor: ReviewActor, id: string, note?: string): Promise<ReviewResult> {
    const now = new Date();
    const cleanNote = note?.trim() || undefined;
    const out = await mutateInspection(this.store, id, async (locked, meta, tx) => {
      if (consignmentStage(locked) !== 'reviewing' || !meta.report) throw inspectionBadStage();
      const report = meta.report;
      if (report.listingPhotoIds.length < LISTING_PHOTOS_MIN) {
        throw reviewIncomplete(`Phiếu chỉ có ${report.listingPhotoIds.length} ảnh niêm yết (cần ≥ ${LISTING_PHOTOS_MIN}) — không thể niêm yết, hãy từ chối.`);
      }
      if (locked.unit.doorLockType === DoorLockType.ELECTRONIC_PIN) {
        const read = await this.doors.readPin(locked.unitId, tx);
        if (read?.type !== 'ELECTRONIC_PIN') throw reviewIncomplete('Căn khoá điện tử chưa có mã PIN trong hệ thống — chưa thể niêm yết.');
      }

      const pricing = report.pricing ?? originalPricing(meta);
      const decided = { decidedAt: now.toISOString(), decidedBy: actor.profileId, ...(cleanNote ? { decisionNote: cleanNote } : {}) };
      let extra: Prisma.ExclusiveMandateUncheckedUpdateInput = {};
      let listedAt: string | null = null;
      let next: ConsignmentMeta;
      if (pricingChanged(pricing, meta)) {
        const proposal: PricingProposal = {
          rent: pricing.rent,
          securityDeposit: pricing.securityDeposit,
          reason: report.pricing?.reason ?? report.note ?? null,
          proposedAt: now.toISOString(),
          original: originalPricing(meta),
        };
        next = { ...meta, stage: 'awaiting_landlord', pricingProposal: proposal, ...decided };
      } else {
        const published = await this.publisher.publish(tx, locked, report, meta.inspection?.photos ?? [], {
          now,
          agreed: { rent: pricing.rent, securityDeposit: pricing.securityDeposit },
        });
        extra = published.mandateData;
        listedAt = published.listedAt;
        next = { ...meta, stage: 'approved', ...decided };
      }
      const result: ReviewResult = { stage: next.stage as ReviewResult['stage'], unitCode: locked.unit.unitCode, listedAt };
      return { meta: next, extra, result: { result, unitId: locked.unitId, mandateId: locked.id } };
    });

    await this.audit.log({
      actorId: actor.profileId,
      actorRole: 'ops_admin',
      actionType: 'CONSIGNMENT_REVIEW_APPROVED',
      entityName: 'ExclusiveMandate',
      entityId: out.mandateId,
      newValue: { stage: out.result.stage, note: cleanNote ?? null },
    });
    if (out.result.stage === 'approved') {
      await this.audit.log({
        actorId: actor.profileId,
        actorRole: 'ops_admin',
        actionType: 'UNIT_PUBLISHED',
        entityName: 'Unit',
        entityId: out.unitId,
        newValue: { unitCode: out.result.unitCode, mandateId: out.mandateId },
      });
    }
    this.logger.log(`[REVIEW] Admin duyệt ${out.result.unitCode}: ${out.result.stage}`);
    return out.result;
  }

  async reject(actor: ReviewActor, id: string, note: string): Promise<ReviewResult> {
    const now = new Date();
    const reason = note.trim();
    const out = await mutateInspection(this.store, id, async (locked, meta) => {
      if (consignmentStage(locked) !== 'reviewing') throw inspectionBadStage();
      const next: ConsignmentMeta = { ...meta, stage: 'rejected', decisionNote: reason, decidedAt: now.toISOString(), decidedBy: actor.profileId };
      const result: ReviewResult = { stage: 'rejected', unitCode: locked.unit.unitCode, listedAt: null };
      return { meta: next, extra: { status: MandateStatus.TERMINATED }, result: { result, mandateId: locked.id } };
    });
    await this.audit.log({
      actorId: actor.profileId,
      actorRole: 'ops_admin',
      actionType: 'CONSIGNMENT_REVIEW_REJECTED',
      entityName: 'ExclusiveMandate',
      entityId: out.mandateId,
      newValue: { note: reason },
    });
    this.logger.log(`[REVIEW] Admin từ chối ${out.result.unitCode}`);
    return out.result;
  }
}
