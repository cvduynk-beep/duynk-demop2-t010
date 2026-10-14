import { describe, expect, it, vi } from "vitest";
import type { ApiResponse } from "@/lib/apiClient";
import { validateFullName } from "@/lib/account/profile";
import { effectiveSaved, runToggle } from "@/lib/tenant/favorites";

const ok: ApiResponse<unknown> = { ok: true, status: 200, data: {} };
const fail500: ApiResponse<unknown> = { ok: false, status: 500, data: {}, message: "boom" };

function deps(call: () => Promise<ApiResponse<unknown>>) {
  const pending = new Map<string, boolean>();
  const seen: Array<boolean | undefined> = [];
  const d = {
    pending,
    emit: vi.fn(() => seen.push(pending.get("VHOP-S1.02-0803"))),
    call: vi.fn(call),
    onSuccess: vi.fn(),
    onError: vi.fn(),
  };
  return { d, seen };
}

describe("favorites — optimistic có rollback, đồng bộ mọi trái tim", () => {
  it("effectiveSaved: thay đổi đang chờ đè trạng thái server; không phân biệt hoa/thường", () => {
    const server = new Set(["VHOP-S1.02-0803"]);
    expect(effectiveSaved(server, new Map(), "vhop-s1.02-0803")).toBe(true);
    expect(effectiveSaved(server, new Map([["VHOP-S1.02-0803", false]]), "VHOP-S1.02-0803")).toBe(false);
    expect(effectiveSaved(new Set(), new Map([["VHOP-S1.02-0803", true]]), "VHOP-S1.02-0803")).toBe(true);
  });

  it("thành công: đổi NGAY (trước khi server trả), đồng bộ lại rồi mới gỡ trạng thái tạm", async () => {
    const { d, seen } = deps(async () => ok);
    expect(await runToggle("VHOP-S1.02-0803", true, d)).toBe("ok");
    expect(seen).toEqual([true, undefined]); // lần emit 1: optimistic=true; lần 2: gỡ pending sau khi đồng bộ
    expect(d.onSuccess).toHaveBeenCalledTimes(1);
    expect(d.onError).not.toHaveBeenCalled();
    expect(d.call).toHaveBeenCalledWith("VHOP-S1.02-0803", true);
  });

  it("lỗi 5xx / mạng: rollback về trạng thái server và báo lỗi, không đồng bộ giả", async () => {
    const { d, seen } = deps(async () => fail500);
    expect(await runToggle("VHOP-S1.02-0803", false, d)).toBe("error");
    expect(seen).toEqual([false, undefined]);
    expect(d.pending.size).toBe(0);
    expect(d.onError).toHaveBeenCalledWith(fail500);
    expect(d.onSuccess).not.toHaveBeenCalled();
  });

  it("bấm dồn trên cùng một căn khi đang gửi ⇒ bỏ qua (không gửi 2 request)", async () => {
    let release: (r: ApiResponse<unknown>) => void = () => {};
    const { d } = deps(() => new Promise((r) => (release = r)));
    const first = runToggle("VHOP-S1.02-0803", true, d);
    expect(await runToggle("vhop-s1.02-0803", false, d)).toBe("skipped");
    release(ok);
    expect(await first).toBe("ok");
    expect(d.call).toHaveBeenCalledTimes(1);
  });
});

describe("validateFullName — cùng luật với PATCH /me/profile", () => {
  it.each([["", false], ["  ", false], ["A", false], ["An", true], ["  Nguyễn   Văn An ", true], ["x".repeat(100), true], ["x".repeat(101), false]])(
    "%p hợp lệ = %p",
    (v, valid) => {
      expect(validateFullName(v) === null).toBe(valid);
    },
  );
});
