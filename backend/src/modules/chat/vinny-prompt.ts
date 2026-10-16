import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prompt Vinny có phiên bản (`backend/prompts/vinny/<version>/{core,explain,agent}.md`), chọn bằng VINNY_PROMPT_VERSION.
 * Rollback = đặt lại biến về phiên bản cũ. Thiếu file ⇒ ném lỗi lúc khởi động (cấu hình sai phải lộ ra sớm).
 */
export interface VinnyPrompt {
  version: string;
  /** core + explain: giải thích danh sách do matchmaker xếp hạng. */
  explain: string;
  /** core + agent: trả lời có công cụ chỉ đọc. */
  agent: string;
}

const VERSION_RE = /^v\d{1,3}$/;
/** Bỏ chú thích HTML (ghi chú cho người sửa prompt, không gửi cho model). */
const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').trim();

export function loadVinnyPrompt(dir: string, version: string): VinnyPrompt {
  if (!VERSION_RE.test(version)) throw new Error(`VINNY_PROMPT_VERSION không hợp lệ: "${version}" (cần dạng v1, v2…)`);
  const read = (name: string) => {
    const p = join(dir, version, `${name}.md`);
    if (!existsSync(p)) throw new Error(`Thiếu prompt Vinny ${version}/${name}.md trong ${dir} (VINNY_PROMPT_DIR)`);
    return stripComments(readFileSync(p, 'utf-8'));
  };
  const core = read('core');
  return { version, explain: `${core}\n\n${read('explain')}`, agent: `${core}\n\n${read('agent')}` };
}
