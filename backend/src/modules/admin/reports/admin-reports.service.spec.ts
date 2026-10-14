import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminReportsService, EXPORT_MAX_ROWS, REPORTS, STATEMENT_TIMEOUT_MS } from './admin-reports.service';
import { csvCell, csvFilename, toCsv } from './report-csv';
import { maskName, maskPhone } from './report-mask';

const NOW = new Date('2026-10-13T05:00:00Z'); // 12:00 giờ VN
const ADMIN = { id: 'a0000000-0000-4000-8000-00000000000a', role: 'ops_admin' };
const HOST = '5af90a0f-3b92-4852-ac8a-f870cf86a51a';

/**
 * Prisma giả: ghi lại mọi câu lệnh trong transaction (để kiểm thứ tự SET, tham số hoá) và trả dòng theo hàng đợi.
 * Số liệu thật của từng báo cáo được đối chiếu trên Postgres thật (seed + SQL viết tay) — xem README §1.5.4.
 */
function fakeDb(queue: any[][] = []) {
  const executed: string[] = [];
  const raw: Prisma.Sql[] = [];
  const audits: any[] = [];
  const tx = {
    $executeRawUnsafe: jest.fn(async (s: string) => {
      executed.push(s);
      return 0;
    }),
    $queryRaw: jest.fn(async (s: Prisma.Sql) => {
      raw.push(s);
      return queue.shift() ?? [];
    }),
  };
  const prisma: any = {
    building: { findMany: jest.fn(async () => [{ zoneName: 'The Sapphire 1' }, { zoneName: 'The Sapphire 2' }]) },
    auditLog: { create: jest.fn(async ({ data }: any) => audits.push(data)) },
    $transaction: jest.fn(async (cb: any, opts: any) => {
      executed.push(`tx:${JSON.stringify(opts)}`);
      return cb(tx);
    }),
  };
  const phones: any = { decrypt: () => '+84912345678' };
  return { svc: new AdminReportsService(prisma, phones), prisma, tx, executed, raw, audits };
}

const errOf = async (p: Promise<unknown>) => p.then(() => null, (e) => e);

describe('AdminReportsService — danh mục & whitelist tham số', () => {
  it('danh mục: 3 báo cáo, bộ lọc/sort/cột khai báo, phân khu từ DB, giới hạn', async () => {
    const c = await fakeDb().svc.catalog();
    expect(c.reports.map((r) => r.id)).toEqual(['host-performance', 'deals', 'host-earnings']);
    expect(c).toMatchObject({ timezone: 'Asia/Ho_Chi_Minh', maxDays: 366, exportFormats: ['csv'], zones: ['The Sapphire 1', 'The Sapphire 2'] });
    expect(c.reports.find((r) => r.id === 'deals')!.statuses).toEqual(['PAID_HOLDING', 'CONVERTED_TO_CONTRACT', 'FORFEITED', 'REFUNDED']);
  });

  it('id lạ ⇒ 404 report_not_found', async () => {
    const e = await errOf(fakeDb().svc.run('campaign-roi', {}, NOW));
    expect(e).toBeInstanceOf(NotFoundException);
    expect(e.getResponse()).toMatchObject({ code: 'report_not_found' });
  });

  it('mặc định 30 ngày tới hôm nay (giờ VN); khoảng theo ngày lịch VN', async () => {
    const { svc } = fakeDb();
    const q = await svc.parseQuery(REPORTS[0], {}, NOW);
    expect([q.range.from, q.range.to, q.range.days]).toEqual(['2026-09-14', '2026-10-13', 30]);
    expect(q.range.start.toISOString()).toBe('2026-09-13T17:00:00.000Z'); // 00:00 VN
    expect(q.range.end.toISOString()).toBe('2026-10-13T17:00:00.000Z'); // 00:00 VN hôm sau
    expect([q.page, q.pageSize, q.sort, q.dir]).toEqual([1, 20, 'deals', 'desc']);
  });

  it.each([
    [{ from: '2026-10-10', to: '2026-10-01' }, 'invalid_range', 'from'],
    [{ from: '2025-01-01', to: '2026-10-10' }, 'invalid_range', 'to'],
    [{ from: '2026-02-30' }, 'invalid_range', 'from'],
    [{ sort: 'paid_at; DROP TABLE units' }, 'invalid_report_query', 'sort'],
    [{ sort: 'toString' }, 'invalid_report_query', 'sort'],
    [{ dir: 'sideways' }, 'invalid_report_query', 'dir'],
    [{ zone: "x' OR 1=1 --" }, 'invalid_report_query', 'zone'],
    [{ hostId: 'not-a-uuid' }, 'invalid_report_query', 'hostId'],
    [{ status: 'PAID_HOLDING' }, 'invalid_report_query', 'status'], // host-performance không lọc trạng thái
    [{ page: '0' }, 'invalid_report_query', 'page'],
    [{ pageSize: '101' }, 'invalid_report_query', 'pageSize'],
  ])('host-performance %j ⇒ 400 %s, lỗi field %s, không chạy SQL', async (query, code, field) => {
    const db = fakeDb();
    const e = await errOf(db.svc.run('host-performance', query as any, NOW));
    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.getResponse()).toMatchObject({ code, errors: { [field]: expect.any(String) } });
    expect(db.raw).toHaveLength(0);
  });
});

describe('AdminReportsService — chạy báo cáo', () => {
  it('một transaction CHỈ ĐỌC, SET TRANSACTION trước, statement_timeout; mọi giá trị là tham số (không nối chuỗi)', async () => {
    const db = fakeDb([[], [{ hosts: 0, tours: 0, deals: 0, grv: '0' }]]);
    await db.svc.run('host-performance', { zone: 'The Sapphire 1', hostId: HOST, from: '2026-10-01', to: '2026-10-10' }, NOW);
    expect(db.executed[0]).toContain(`"timeout":${STATEMENT_TIMEOUT_MS + 5000}`);
    expect(db.executed.slice(1)).toEqual(['SET TRANSACTION READ ONLY', `SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`]);
    expect(db.raw).toHaveLength(2); // dòng + tổng, tuần tự trên cùng kết nối
    for (const s of db.raw) {
      expect(s.text).not.toContain('The Sapphire 1');
      expect(s.text).not.toContain(HOST);
      expect(s.values).toEqual(expect.arrayContaining(['The Sapphire 1', HOST]));
    }
  });

  it('sort chỉ đi qua whitelist ⇒ ORDER BY dùng biểu thức đã khai báo; phân trang LIMIT/OFFSET là tham số', async () => {
    const db = fakeDb([[], [{}]]);
    await db.svc.run('deals', { sort: 'monthlyRent', dir: 'asc', page: '3', pageSize: '10' }, NOW);
    expect(db.raw[0].text).toMatch(/ORDER BY monthly_rent ASC NULLS LAST, deposit_code ASC\s+LIMIT \$\d+ OFFSET \$\d+/);
    expect(db.raw[0].values.slice(-2)).toEqual([10, 20]);
  });

  it('deals: map tiền dạng chuỗi decimal, che tên + SĐT, summary của cả tập; meta có múi giờ + định nghĩa', async () => {
    const row = {
      deposit_code: 'DEP-1', received_at: new Date('2026-10-10T16:45:00Z'), status: 'PAID_HOLDING', unit_code: 'VHOP-1', layout: 'STUDIO',
      unit_zone: 'The Sapphire 1', host_name: 'Host A', host_zone: 'The Sapphire 1', tenant_name: 'Nguyễn Văn An', contact_phone_enc: 'enc',
      deposit_amount_t: '2000000.00', inbound_t: '2000000.00', refund_t: '0', monthly_rent_t: '12500000.00', rent_source: 'listing',
      contract_number: null, contract_status: null, cycle_days_f: 2.5,
    };
    const summary = { rows: 7, inbound: '14000000.00', refund: '2000000.00', net_held: '12000000.00', closed: 6, grv: '75000000.00', by_status: { PAID_HOLDING: 6, REFUNDED: 1 } };
    const out = await fakeDb([[row], [summary]]).svc.run('deals', { pageSize: '1' }, NOW);
    expect(out.rows[0]).toMatchObject({ tenantName: 'Nguyễn V. A.', tenantPhone: '09•• ••• 678', monthlyRent: '12500000.00', receivedAt: '2026-10-10T16:45:00.000Z' });
    expect(JSON.stringify(out)).not.toContain('Nguyễn Văn An');
    expect(out).toMatchObject({ total: 7, page: 1, pageSize: 1 });
    expect(out.summary).toMatchObject({ rows: 7, closedDeals: 6, grv: '75000000.00', byStatus: { PAID_HOLDING: 6, CONVERTED_TO_CONTRACT: 0, FORFEITED: 0, REFUNDED: 1 } });
    expect(out.meta).toMatchObject({ timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', moneyFormat: 'string-decimal', definitions: expect.objectContaining({ receivedAt: expect.any(String) }) });
  });
});

describe('AdminReportsService — xuất CSV', () => {
  it('ghi audit REPORT_EXPORTED (ai, báo cáo, bộ lọc, số dòng — không PII) rồi trả CSV có BOM', async () => {
    const db = fakeDb([[{ id: HOST, full_name: 'Host A', assigned_zone: 'The Sapphire 1', tours: 2, deals: 1, grv_text: '9800000.00' }], [{ hosts: 1 }]]);
    const file = await db.svc.exportCsv('host-performance', { from: '2026-10-01', to: '2026-10-10', zone: 'The Sapphire 1' }, ADMIN, NOW);
    expect(db.audits).toEqual([
      {
        actorId: ADMIN.id,
        actorRole: 'ops_admin',
        actionType: 'REPORT_EXPORTED',
        entityName: 'reports',
        entityId: 'host-performance',
        newValue: { format: 'csv', from: '2026-10-01', to: '2026-10-10', zone: 'The Sapphire 1', hostId: null, status: null, sort: 'deals', dir: 'desc', rows: 1 },
      },
    ]);
    expect(file.filename).toBe('vinstay-host-performance_2026-10-01_2026-10-10.csv');
    expect(file.content.startsWith('﻿Field Host,Phân khu,Lượt dẫn')).toBe(true);
    expect(db.raw[0].values.slice(-2)).toEqual([EXPORT_MAX_ROWS + 1, 0]); // không phân trang, chặn ở trần + 1
  });

  it('vượt trần dòng ⇒ 422 export_too_large, KHÔNG ghi audit, không trả file', async () => {
    const many = Array.from({ length: EXPORT_MAX_ROWS + 1 }, (_, i) => ({ id: `h${i}`, total: EXPORT_MAX_ROWS + 1 }));
    const db = fakeDb([many, [{ hosts: EXPORT_MAX_ROWS + 1 }]]);
    const e = await errOf(db.svc.exportCsv('host-performance', {}, ADMIN, NOW));
    expect(e).toBeInstanceOf(UnprocessableEntityException);
    expect(e.getResponse()).toMatchObject({ code: 'export_too_large' });
    expect(db.audits).toHaveLength(0);
  });

  it('format khác csv ⇒ 400; ghi audit lỗi ⇒ lỗi lan ra (không trả file khi không ghi được vết)', async () => {
    expect((await errOf(fakeDb().svc.exportCsv('deals', { format: 'xlsx' }, ADMIN, NOW))).getResponse()).toMatchObject({ errors: { format: expect.any(String) } });
    const db = fakeDb([[], [{}]]);
    db.prisma.auditLog.create.mockRejectedValueOnce(new Error('audit down'));
    await expect(db.svc.exportCsv('deals', {}, ADMIN, NOW)).rejects.toThrow('audit down');
  });
});

describe('CSV & che PII', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+84912', "'+84912"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tx', "'\tx"],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
    ['Nguyễn V. A.', 'Nguyễn V. A.'],
  ])('ô %j ⇒ %j', (input, out) => expect(csvCell(input)).toBe(out));

  it('số giữ nguyên (kể cả âm), null ⇒ rỗng; file có BOM + CRLF; tên file an toàn', () => {
    expect([csvCell(-5), csvCell(0), csvCell(null)]).toEqual(['-5', '0', '']);
    const csv = toCsv([{ key: 'a', label: 'Cột A' }, { key: 'b', label: 'Cột B', value: (r: any) => r.b * 2 }], [{ a: 'x', b: 2 }]);
    expect(csv).toBe('﻿Cột A,Cột B\r\nx,4\r\n');
    expect(csvFilename('deals', '2026-10-01', '2026-10-10"; x')).toBe('vinstay-deals_2026-10-01_2026-10-10x.csv');
  });

  it('che tên/SĐT', () => {
    expect(maskName('Nguyễn Văn An')).toBe('Nguyễn V. A.');
    expect(maskName('  trần   thị  bích ')).toBe('trần T. B.');
    expect(maskName('An')).toBe('A.');
    expect(maskName('')).toBeNull();
    expect(maskPhone('0912345678')).toBe('09•• ••• 678');
    expect(maskPhone('12')).toBeNull();
  });
});
