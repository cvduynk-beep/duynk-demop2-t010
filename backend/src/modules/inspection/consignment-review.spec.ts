import { AuditService } from '../audit/audit.service';
import { ConsignmentReviewService } from './consignment-review.service';
import { World, buildWorld, fullPhotos, validInput } from './testing/world';

/** Admin quyết hồ sơ `reviewing` (Inspector đề xuất không duyệt — căn bất thường). Luồng thật trên FakeInspectionDb. */
const codeOf = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => e.getResponse?.().code ?? e.message);
const ADMIN = { profileId: 'admin-1' };

describe('ConsignmentReviewService — Admin duyệt / từ chối hồ sơ reviewing', () => {
  let w: World;
  let a: ReturnType<World['addInspector']>;
  let review: ConsignmentReviewService;

  beforeEach(() => {
    w = buildWorld();
    a = w.addInspector('a');
    review = new ConsignmentReviewService(w.store, w.doors, w.publisher, new AuditService(w.prisma));
  });

  /** Ca đã được Inspector nộp "không duyệt" ⇒ stage reviewing. */
  const reviewing = async (over: Record<string, unknown> = {}, o: Parameters<World['addCase']>[0] = {}) => {
    const photos = fullPhotos(a.id);
    const c = w.addCase({ stage: 'inspecting', hostId: a.id, photos, ...o });
    await w.flow.submit(w.actor(a), c.mandate.id, validInput(photos, { recommendation: 'reject', note: 'Nội thất sai hiện trạng', ...over } as any));
    expect(w.metaOf(c.mandate).stage).toBe('reviewing');
    return c;
  };

  it('duyệt, giá giữ nguyên ⇒ approved, niêm yết ngay (AVAILABLE, media, ủy quyền ACTIVE), decidedBy = Admin', async () => {
    const c = await reviewing();
    const out = await review.approve(ADMIN, c.mandate.id, '  Đã xác minh với chủ nhà ');
    expect(out).toMatchObject({ stage: 'approved', unitCode: c.unit.unitCode });
    expect(out.listedAt).toBeTruthy();
    expect(w.unitRow(c.unit)).toMatchObject({ status: 'AVAILABLE', isVerified: true, baseRentPrice: 6_500_000 });
    expect(w.db.media.length).toBeGreaterThan(0);
    expect(w.mandateRow(c.mandate).status).toBe('ACTIVE');
    expect(w.metaOf(c.mandate)).toMatchObject({ stage: 'approved', decidedBy: 'admin-1', decisionNote: 'Đã xác minh với chủ nhà' });
  });

  it('duyệt, phiếu đổi giá (giá quá cao) ⇒ awaiting_landlord + pricingProposal, KHÔNG niêm yết', async () => {
    const c = await reviewing({ note: 'Giá thuê quá cao', pricing: { rent: 6_000_000, securityDeposit: 6_000_000, reason: 'Giá thị trường' } });
    const out = await review.approve(ADMIN, c.mandate.id);
    expect(out).toEqual({ stage: 'awaiting_landlord', unitCode: c.unit.unitCode, listedAt: null });
    expect(w.unitRow(c.unit).status).toBe('UNLISTED');
    expect(w.db.media).toHaveLength(0);
    expect(w.metaOf(c.mandate).pricingProposal).toMatchObject({
      rent: 6_000_000, securityDeposit: 6_000_000, reason: 'Giá thị trường', original: { rent: 6_500_000, securityDeposit: 6_500_000 },
    });
  });

  it('phiếu thiếu ảnh niêm yết ⇒ review_incomplete, hồ sơ giữ reviewing', async () => {
    const c = await reviewing({ listingPhotoIds: [] });
    expect(await codeOf(review.approve(ADMIN, c.mandate.id))).toBe('review_incomplete');
    expect(w.metaOf(c.mandate).stage).toBe('reviewing');
    expect(w.unitRow(c.unit).status).toBe('UNLISTED');
  });

  it('khoá điện tử chưa có PIN ⇒ review_incomplete', async () => {
    const c = await reviewing({}, { pin: null });
    expect(await codeOf(review.approve(ADMIN, c.mandate.id))).toBe('review_incomplete');
  });

  it('từ chối ⇒ rejected, ủy quyền TERMINATED, lý do lưu; ảnh giữ', async () => {
    const c = await reviewing();
    const out = await review.reject(ADMIN, c.mandate.id, '  Căn không đạt chuẩn ');
    expect(out).toEqual({ stage: 'rejected', unitCode: c.unit.unitCode, listedAt: null });
    expect(w.mandateRow(c.mandate).status).toBe('TERMINATED');
    expect(w.unitRow(c.unit).status).toBe('UNLISTED');
    expect(w.metaOf(c.mandate)).toMatchObject({ stage: 'rejected', decisionNote: 'Căn không đạt chuẩn', decidedBy: 'admin-1' });
    expect(w.metaOf(c.mandate).inspection?.photos?.length).toBeGreaterThan(0);
  });

  it('chỉ quyết được hồ sơ reviewing: căn bình thường (approved) / đang thẩm định ⇒ inspection_bad_stage', async () => {
    const photos = fullPhotos(a.id);
    const normal = w.addCase({ stage: 'inspecting', hostId: a.id, photos });
    await w.flow.submit(w.actor(a), normal.mandate.id, validInput(photos));
    expect(await codeOf(review.approve(ADMIN, normal.mandate.id))).toBe('inspection_bad_stage');
    expect(await codeOf(review.reject(ADMIN, normal.mandate.id, 'Không đạt chuẩn'))).toBe('inspection_bad_stage');
    const busy = w.addCase({ stage: 'inspecting', hostId: a.id, photos: fullPhotos(a.id) });
    expect(await codeOf(review.approve(ADMIN, busy.mandate.id))).toBe('inspection_bad_stage');
  });

  it('Inspector vẫn thấy ca reviewing trong mục đã xong và mở được chi tiết', async () => {
    const c = await reviewing();
    const board = await w.query.board(w.actor(a), new Date());
    expect(board.done.map((x) => x.id)).toContain(c.mandate.id);
    expect(board.done.find((x) => x.id === c.mandate.id)?.stage).toBe('reviewing');
    await expect(w.query.detail(w.actor(a), c.mandate.id, new Date())).resolves.toMatchObject({ stage: 'reviewing' });
  });
});
