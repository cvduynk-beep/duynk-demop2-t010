import { buildWorld, min, NOW, sec } from '../host-viewings/testing/world';
import { haversineM } from './dispatch-assigner.service';

beforeEach(() => jest.useFakeTimers({ now: NOW }));
afterEach(() => jest.useRealTimers());

const live = (w: ReturnType<typeof buildWorld>, viewingId: string) =>
  w.db.tickets.filter((t) => t.viewingId === viewingId).map((t) => [t.status, t.hostId, t.rejectReason ?? null]);

describe('Lỗi B — ca chính hết SLA 3′ phải giao lại tầng 1, không trôi ra pool cho mọi Sale (2026-10-14)', () => {
  it('TÁI HIỆN: quá 3′ A chưa nhận ⇒ A mất ca (EXPIRED sla_timeout), B cùng phân khu được giao ASSIGNED với 3′ mới', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    const b = w.addHost('b');
    const v = w.addViewing(w.addUnit('U1'));
    w.addTicket(v, { hostId: a.id });

    expect(await w.sla.sweep(sec(180))).toMatchObject({ reassigned: 1 });
    expect(live(w, v.id)).toEqual([
      ['EXPIRED', a.id, 'sla_timeout'],
      ['OFFERED', b.id, null],
    ]);
    // B thấy ca ở tầng ASSIGNED (nhận bằng "Nhận ca"), hạn mới tính từ lúc giao lại; A không còn thấy ca.
    const boardB = (await w.board.board(await w.actor(b), sec(200))).requests;
    expect(boardB).toHaveLength(1);
    expect(boardB[0]).toMatchObject({ tier: 'ASSIGNED', canAccept: true });
    expect((await w.board.board(await w.actor(a), sec(200))).requests).toHaveLength(0);
  });

  it('đúng mốc: 179s chưa giao lại, 180s giao lại (cùng quy tắc tầng ASSIGNED < 180s)', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    w.addHost('b');
    const v = w.addViewing(w.addUnit('U1'));
    w.addTicket(v, { hostId: a.id });
    expect((await w.sla.sweep(sec(179))).reassigned).toBe(0);
    expect((await w.sla.sweep(sec(180))).reassigned).toBe(1);
  });

  it('phân khu của căn hết Sale rảnh ⇒ Sale rảnh ở phân khu GẦN NHẤT (không phải phân khu xa hơn); audit ghi match + khoảng cách', async () => {
    const w = buildWorld();
    w.addUnit('NEAR', { zone: 'Gần', lat: 20.995, lng: 105.94 });
    w.addUnit('FAR', { zone: 'Xa', lat: 21.05, lng: 105.94 });
    const a = w.addHost('a');
    const far = w.addHost('far', { zone: 'Xa' });
    const near = w.addHost('near', { zone: 'Gần' });
    const v = w.addViewing(w.addUnit('U1', { lat: 20.99, lng: 105.94 }));
    w.addTicket(v, { hostId: a.id });

    expect((await w.sla.sweep(sec(181))).reassigned).toBe(1);
    expect(live(w, v.id)[1]).toEqual(['OFFERED', near.id, null]);
    expect(w.db.tickets.some((t) => t.hostId === far.id)).toBe(false);
    const audit = w.db.audits.find((x) => x.actionType === 'DISPATCH_REASSIGNED');
    expect(audit).toMatchObject({ actorId: 'admin-system', actorRole: 'system', entityId: v.id });
    expect(audit.oldValue).toMatchObject({ hostId: a.id });
    expect(audit.newValue).toMatchObject({ hostId: near.id, reason: 'sla_timeout', round: 1, match: 'nearest_zone', zone: 'Gần' });
    expect(audit.newValue.distanceM).toBe(Math.round(haversineM(20.99, 105.94, 20.995, 105.94)));
  });

  it('tối đa 2 lần giao lại; lần hết hạn thứ 3 ⇒ giữ nguyên ticket ở pool (không giao trùng người cũ)', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    const b = w.addHost('b');
    const c = w.addHost('c');
    w.addHost('d');
    const v = w.addViewing(w.addUnit('U1'));
    w.addTicket(v, { hostId: a.id });

    await w.sla.sweep(sec(180)); // → b hoặc người ít việc nhất
    await w.sla.sweep(sec(360)); // lần 2
    expect(await w.sla.sweep(sec(540))).toMatchObject({ reassigned: 0, max_rounds: 1 });
    const rows = live(w, v.id);
    expect(rows.filter((r) => r[0] === 'EXPIRED')).toHaveLength(2);
    expect(rows.filter((r) => r[0] === 'OFFERED')).toHaveLength(1);
    expect(new Set(rows.map((r) => r[1])).size).toBe(3); // 3 người khác nhau
    void b; void c;
  });

  it('không còn Sale nào rảnh ⇒ không đổi gì (ca ở pool như cũ)', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    w.addHost('off', { duty: 'OFF_DUTY' });
    w.addHost('unverified', { verified: false });
    const v = w.addViewing(w.addUnit('U1'));
    const t = w.addTicket(v, { hostId: a.id });
    expect(await w.sla.sweep(sec(200))).toMatchObject({ reassigned: 0, no_candidate: 1 });
    expect(w.db.tickets.find((x) => x.id === t.id)).toMatchObject({ status: 'OFFERED', hostId: a.id });
    expect(w.db.audits).toHaveLength(0);
  });

  it('hai sweep chạy chồng (2 instance) ⇒ chỉ giao lại MỘT lần', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    w.addHost('b');
    w.addHost('c');
    const v = w.addViewing(w.addUnit('U1'));
    w.addTicket(v, { hostId: a.id });
    const [x, y] = await Promise.all([w.sla.sweep(sec(200)), w.sla.sweep(sec(200))]);
    expect(x.reassigned + y.reassigned).toBe(1);
    expect(live(w, v.id).filter((r) => r[0] === 'OFFERED')).toHaveLength(1);
    expect(w.db.audits.filter((r) => r.actionType === 'DISPATCH_REASSIGNED')).toHaveLength(1);
  });

  it('ca đã được nhận / bị huỷ / đã qua giờ hẹn ⇒ không giao lại', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    w.addHost('b');
    const unit = w.addUnit('U1');
    const accepted = w.addViewing(unit, { status: 'CONFIRMED' });
    w.addTicket(accepted, { hostId: a.id, status: 'ACCEPTED', acceptedAt: NOW });
    const cancelled = w.addViewing(unit, { slot: min(300), status: 'CANCELLED' });
    w.addTicket(cancelled, { hostId: a.id });
    const past = w.addViewing(unit, { slot: min(2) });
    w.addTicket(past, { hostId: a.id });
    expect((await w.sla.sweep(min(4))).reassigned).toBe(0);
    expect(w.db.tickets.every((t) => t.status !== 'EXPIRED')).toBe(true);
  });

  it('khởi động lại giữa chừng: ticket quá hạn từ lâu (trong 24h, ca chưa tới giờ) vẫn được giao lại ở lần sweep đầu', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    const b = w.addHost('b');
    const v = w.addViewing(w.addUnit('U1'), { slot: min(600) });
    w.addTicket(v, { hostId: a.id });
    expect((await w.sla.sweep(min(90))).reassigned).toBe(1);
    expect(live(w, v.id)[1]).toEqual(['OFFERED', b.id, null]);
  });

  it('Sale đã từ chối ca này không bị giao lại', async () => {
    const w = buildWorld();
    const a = w.addHost('a');
    const b = w.addHost('b');
    const c = w.addHost('c');
    const v = w.addViewing(w.addUnit('U1'));
    w.addTicket(v, { hostId: b.id, status: 'ESCALATED' });
    w.addTicket(v, { hostId: a.id });
    await w.sla.sweep(sec(200));
    expect(live(w, v.id).find((r) => r[0] === 'OFFERED')).toEqual(['OFFERED', c.id, null]);
  });
});
