/**
 * Kiểm bộ eval Vinny khớp DỮ LIỆU THẬT hiện tại (không gọi Gemini). Chạy trước mỗi lần eval vì giá / căn trống thay đổi:
 *   npm run eval:vinny:check
 * - Mã căn trong câu khách phải là căn công khai (trừ ca ghi chú cố ý: căn đã thuê, mã giả).
 * - Ca có `hieu_dung` + `recs: some|none` ⇒ chạy matchmaker với ĐÚNG tiêu chí mong đợi, số căn khớp phải đúng kỳ vọng.
 * Mã thoát 1 nếu có ca lệch dữ liệu (sửa evals/vinny/build_sets.py rồi sinh lại — không sửa đáp án cho khớp Vinny).
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

process.env.HOLD_EXPIRY_SWEEP_INTERVAL_MS = '0';
process.env.DISPATCH_SLA_SWEEP_INTERVAL_MS = '0';

const ROOT = resolve(__dirname, '..', 'evals', 'vinny');
/** Mã cố ý không công khai (ghi trong ghi_chu của ca). */
const INTENTIONAL = new Set(['VHOP-BE3-1301', 'VHOP-ABC-9999', 'VHOP-S9.99-9999']);

async function main() {
  const { AppModule } = await import('../src/app.module');
  const { MatchmakerService } = await import('../src/modules/matchmaker/matchmaker.service');
  const { PropertyService } = await import('../src/modules/property/property.service');
  const { plainToInstance } = await import('class-transformer');
  const { MatchmakerRequestDto } = await import('../src/modules/matchmaker/dto/matchmaker-request.dto');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const mm = app.get(MatchmakerService);
  const prop = app.get(PropertyService);
  const re = /\bVHOP-[A-Z0-9][A-Z0-9.]{0,9}-[0-9A-Z]{2,6}\b/gi;
  const problems: string[] = [];
  let checked = 0;
  for (const f of ['a_mot_luot', 'b_nhieu_luot', 'c_tan_cong', 'd_giu_kin']) {
    for (const l of readFileSync(join(ROOT, `${f}.jsonl`), 'utf8').split('\n').filter(Boolean)) {
      const c = JSON.parse(l);
      const turns = c.luot ?? [{ hoi: c.hoi, dieu_kien_dung: c.dieu_kien_dung }];
      for (const [i, t] of turns.entries()) {
        for (const m of t.hoi.matchAll(re)) {
          const code = m[0].toUpperCase();
          if (INTENTIONAL.has(code)) continue;
          if (!(await prop.getUnitByCode(code).then(() => true, () => false))) problems.push(`${c.id}#${i + 1}: mã ${code} không còn công khai`);
        }
        const k = t.dieu_kien_dung;
        const h = k.hieu_dung;
        if (!h || !k.recs || k.recs === 'any') continue;
        checked += 1;
        const dto = plainToInstance(MatchmakerRequestDto, {
          maxAllInBudget: h.budget ?? 200_000_000,
          layouts: h.layouts,
          zones: h.zones,
          buildings: h.buildings,
          household: { persons: h.persons ?? 1, motorbikes: h.motorbikes ?? 0, cars: h.cars ?? 0 },
        });
        const n = (await mm.findTopRecommendations(dto as never)).scanSummary.totalMatched;
        if ((k.recs === 'some') !== n > 0) problems.push(`${c.id}#${i + 1} "${t.hoi}": mong đợi recs=${k.recs}, dữ liệu thật khớp ${n} căn`);
      }
    }
  }
  await app.close();
  console.log(`[check] ${checked} ca có kỳ vọng kết quả đã đối chiếu matchmaker · ${problems.length} vấn đề`);
  problems.forEach((p) => console.log(`  ✗ ${p}`));
  process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
  console.error('[check] lỗi:', e?.message ?? e);
  process.exit(2);
});
