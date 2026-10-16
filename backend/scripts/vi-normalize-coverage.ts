/**
 * Đo OFFLINE (không gọi Gemini, không đổi luồng chat): bộ phân tích tiêu chí hiện có so với "chuẩn hoá tiếng Việt + bộ
 * phân tích" trên các lượt có `hieu_dung` của bộ A và B (KHÔNG dùng bộ D — giữ kín).
 * Giả lập đúng cách web gộp tiêu chí qua các lượt (chỉ phần tất định: lượt có tiêu chí mới được gộp).
 *   npx ts-node --transpile-only scripts/vi-normalize-coverage.ts
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emptyCriteria, parseMessage } from '../src/modules/chat/chat-criteria';
import { normalizeVi } from '../src/modules/chat/vi-normalize';

const ROOT = resolve(__dirname, '..', 'evals', 'vinny');
const NOW = new Date();
const same = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.includes(x));

function score(useNormalizer: boolean) {
  let total = 0;
  let ok = 0;
  const misses: string[] = [];
  for (const f of ['a_mot_luot', 'b_nhieu_luot']) {
    for (const l of readFileSync(join(ROOT, `${f}.jsonl`), 'utf8').split('\n').filter(Boolean)) {
      const c = JSON.parse(l);
      const turns = c.luot ?? [{ hoi: c.hoi, dieu_kien_dung: c.dieu_kien_dung }];
      let crit = emptyCriteria();
      let searched = false;
      for (const [i, t] of turns.entries()) {
        const text = useNormalizer ? normalizeVi(t.hoi, NOW).text : t.hoi;
        const p = parseMessage(text, crit, searched);
        if (p.strongSignal || p.weakSignal || JSON.stringify(p.criteria.household) !== JSON.stringify(crit.household)) {
          crit = p.criteria;
          searched = true;
        }
        const h = t.dieu_kien_dung.hieu_dung;
        if (!h) continue;
        total += 1;
        const miss: string[] = [];
        if (h.budget !== undefined && crit.budget !== h.budget) miss.push(`budget=${crit.budget}`);
        if (h.layouts && !same(h.layouts, crit.layouts)) miss.push(`layouts=${crit.layouts}`);
        if (h.zones && !same(h.zones, crit.zones)) miss.push(`zones=${crit.zones}`);
        if (h.buildings && !same(h.buildings, crit.buildings)) miss.push(`buildings=${crit.buildings}`);
        if (h.persons !== undefined && crit.household.persons !== h.persons) miss.push(`persons=${crit.household.persons}`);
        if (h.motorbikes !== undefined && crit.household.motorbikes !== h.motorbikes) miss.push(`motorbikes=${crit.household.motorbikes}`);
        if (h.cars !== undefined && crit.household.cars !== h.cars) miss.push(`cars=${crit.household.cars}`);
        if (miss.length) misses.push(`${c.id}#${i + 1} "${t.hoi}": ${miss.join(', ')}`);
        else ok += 1;
      }
    }
  }
  return { total, ok, misses };
}

const before = score(false);
const after = score(true);
const pct = (n: number, d: number) => Math.round((n / d) * 1000) / 10;
console.log(`Hiểu đúng tiêu chí (phần tất định, A+B, ${before.total} lượt): hiện tại ${before.ok} (${pct(before.ok, before.total)}%) · có chuẩn hoá ${after.ok} (${pct(after.ok, after.total)}%)`);
console.log('\nCòn sai SAU chuẩn hoá:');
after.misses.forEach((m) => console.log(`  - ${m}`));
const fixed = before.misses.filter((m) => !after.misses.some((x) => x.split(':')[0] === m.split(':')[0]));
console.log(`\nChuẩn hoá sửa được (${fixed.length}):`);
fixed.forEach((m) => console.log(`  + ${m}`));
const broke = after.misses.filter((m) => !before.misses.some((x) => x.split(':')[0] === m.split(':')[0]));
console.log(`\nChuẩn hoá làm hỏng (${broke.length}):`);
broke.forEach((m) => console.log(`  ! ${m}`));
