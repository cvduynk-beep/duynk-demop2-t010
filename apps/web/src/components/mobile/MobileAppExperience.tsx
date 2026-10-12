"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Building,
  CalendarCheck,
  ChevronRight,
  Download,
  Heart,
  KeyRound,
  LogOut,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { LuxeExplorer } from "@/components/explorer/LuxeExplorer";
import { Messages } from "@/components/chat/Messages";
import { Composer } from "@/components/chat/Composer";
import { UnitCard } from "@/components/unit/UnitCard";
import { MobileBottomNav } from "@/components/pwa/MobileBottomNav";
import { VINNY_GREETINGS } from "@/components/mascot/ButlerMascot";
import { useMock } from "@/lib/mock/store";
import { useSession, signOut } from "@/lib/auth/client";
import { chatAppend, chatSetCriteria, chatSetSearch, countGuestMessage } from "@/lib/mock/actions";
import { interpret, searchUnits } from "@/lib/mock/matchmaker";
import { unitStatus } from "@/lib/mock/selectors";
import { UNITS } from "@/lib/mock/units";
import { allInCost } from "@/lib/mock/cost";
import styles from "./MobileAppExperience.module.css";

type MobileTab = "explore" | "chat" | "booking" | "saved" | "account";

export function MobileAppExperience({ initialTab = "explore" }: { initialTab?: MobileTab }) {
  const [tab, setTab] = useState<MobileTab>(initialTab);
  const state = useMock();
  const { chat } = state;
  const { user } = useSession();
  const [thinking, setThinking] = useState<{ steps: string[] } | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [greetingIdx, setGreetingIdx] = useState(0);

  useEffect(() => {
    setGreetingIdx(Math.floor(Math.random() * VINNY_GREETINGS.length));
  }, []);

  const statusOf = (u: (typeof UNITS)[number]) => unitStatus(state, u);
  const openCount = UNITS.filter((u) => unitStatus(state, u) === "available").length;

  const savedUnits = UNITS.filter((u) => state.favorites.includes(u.id));

  // Logic chat tương tác
  const onSend = (text: string) => {
    chatAppend({ role: "user", text });
    countGuestMessage();

    const result = interpret(text, chat.criteria, chat.searched, statusOf);
    const isSearch = result.kind === "search";

    setThinking({
      steps: isSearch
        ? [`Quét ${openCount} căn đang mở`, "Lọc theo ngân sách All-in", "Xếp hạng mức tiết kiệm"]
        : ["Đang tìm câu trả lời"],
    });

    setTimeout(() => {
      if (result.kind === "search") {
        chatSetSearch(result.criteria);
        setFreshId(
          chatAppend({
            role: "assistant",
            text: result.reply,
            resultIds: result.results.slice(0, 3).map((r) => r.unit.id),
            criteria: result.criteria,
          }),
        );
      } else {
        setFreshId(chatAppend({ role: "assistant", text: result.reply }));
      }
      setThinking(null);
    }, 1000);
  };

  return (
    <div className={styles.container}>
      {/* ── 1. Top App Bar Di Động ─────────────────────────────────── */}
      <header className={styles.topBar}>
        <Link href="/" className={styles.brand} aria-label="VinStay AI trang chủ">
          <LogoMark size={24} />
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>
              VinStay<span className={styles.brandTag}> AI</span>
            </span>
            <span className={styles.brandSub}>Ocean Park 1 • Mobile App</span>
          </div>
        </Link>

        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.pwaInstallPill}
            title="Thêm VinStay AI vào Màn hình chính"
            onClick={() => {
              if (typeof window !== "undefined") {
                alert("💡 Mẹo cài App: Trên Safari iOS bấm biểu tượng Chia sẻ (Share) ➔ 'Thêm vào MH chính'. Trên Chrome Android bấm menu 3 chấm ➔ 'Cài đặt ứng dụng'.");
              }
            }}
          >
            <Download size={13} />
            <span>Cài App</span>
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Tài khoản"
            onClick={() => setTab("account")}
          >
            <User size={18} />
          </button>
        </div>
      </header>

      {/* ── 2. Nội dung theo từng Tab Native ───────────────────────── */}
      <main className={styles.contentPane}>
        {tab === "explore" && <LuxeExplorer />}

        {tab === "chat" && (
          <div className={styles.chatWrap}>
            <div className={styles.chatMessages}>
              <Messages
                greeting={VINNY_GREETINGS[greetingIdx]}
                messages={chat.messages}
                thinking={thinking}
                freshId={freshId}
                onFreshDone={() => setFreshId(null)}
                onShowResults={() => setTab("explore")}
              />
            </div>
            <div className={styles.chatComposer}>
              <Composer
                variant="rail"
                criteria={chat.criteria}
                onCriteria={(c) => chatSetCriteria(c)}
                onSend={onSend}
                busy={!!thinking}
                locked={false}
                guestNotice={false}
              />
            </div>
          </div>
        )}

        {tab === "booking" && (
          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Lịch xem căn hộ</h2>
              <span className="muted xs">Đón tại sảnh</span>
            </div>

            <div className={styles.glassBox}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <CalendarCheck size={24} style={{ color: "var(--lagoon)" }} />
                <div>
                  <strong style={{ display: "block", fontSize: 15, color: "#0a3d4a" }}>Tra cứu lịch hẹn</strong>
                  <span className="muted xs">Nhập số điện thoại đã đặt lịch để xem mã mở cửa & thông tin Host</span>
                </div>
              </div>
              <Link href="/booking" className="btn btn-primary btn-sm" style={{ width: "100%", justifyContent: "center" }}>
                Tra cứu ngay trên hệ thống
              </Link>
            </div>

            <div className={styles.glassBox}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0a3d4a", marginBottom: 6 }}>
                Quy trình tiếp đón 3 bước của VinStay AI
              </h3>
              <ul className="muted small" style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18 }}>
                <li>Host nội khu nhận ticket và xuống sảnh đón đúng giờ (trước 10p).</li>
                <li>Quẹt thẻ thang máy cư dân dẫn lên tận cửa phòng.</li>
                <li>Mở khóa điện tử qua ứng dụng — Chủ nhà không cần có mặt.</li>
              </ul>
            </div>
          </section>
        )}

        {tab === "saved" && (
          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Căn hộ đã lưu ({savedUnits.length})</h2>
              {savedUnits.length > 0 && <span className="muted xs">Đồng bộ tức thì</span>}
            </div>

            {savedUnits.length === 0 ? (
              <div className={styles.glassBox} style={{ textAlign: "center", padding: "32px 16px" }}>
                <Heart size={36} style={{ color: "#c3cfd2", margin: "0 auto 12px" }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0a3d4a", marginBottom: 6 }}>Chưa có căn nào được lưu</h3>
                <p className="muted small" style={{ marginBottom: 16 }}>
                  Bấm biểu tượng trái tim trên các căn hộ ở bản đồ để lưu và so sánh chi phí All-in.
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab("explore")}>
                  Khám phá rổ hàng ngay
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {savedUnits.map((u) => (
                  <UnitCard key={u.id} unit={u} cost={allInCost(u)} />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "account" && (
          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Tài khoản & Cổng truy cập</h2>
            </div>

            {/* Thông tin người dùng */}
            <div className={styles.glassBox} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0a3d4a, #164e63)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                {user?.fullName?.charAt(0) ?? "K"}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ display: "block", fontSize: 16, color: "#0a3d4a" }}>
                  {user?.fullName ?? "Khách thuê Demo"}
                </strong>
                <span className="muted xs">{user?.email ?? "Khách hàng cá nhân"}</span>
              </div>
              {user && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void signOut("/")}
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>

            {/* Danh sách các cổng */}
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#0a3d4a", marginTop: 8 }}>Chuyển đổi cổng chuyên biệt</h3>

            <Link href="/landlord/consign" className={styles.portalCard}>
              <div className={styles.portalIcon}>
                <Building size={20} />
              </div>
              <div className={styles.portalInfo}>
                <strong>Cổng Chủ Nhà (Ký gửi căn hộ)</strong>
                <span>Quản lý rổ hàng độc quyền, nhận cọc 2 triệu qua VietQR</span>
              </div>
              <ChevronRight size={18} className="muted" />
            </Link>

            <Link href="/admin/login" className={styles.portalCard}>
              <div className={styles.portalIcon}>
                <KeyRound size={20} />
              </div>
              <div className={styles.portalInfo}>
                <strong>Cổng Field Host Nội Khu</strong>
                <span>Nhận ticket dẫn khách, đón tại sảnh, cấp mã mở cửa tức thì</span>
              </div>
              <ChevronRight size={18} className="muted" />
            </Link>

            <Link href="/login?as=admin" className={styles.portalCard}>
              <div className={styles.portalIcon}>
                <ShieldCheck size={20} />
              </div>
              <div className={styles.portalInfo}>
                <strong>Cổng Quản Trị Hệ Thống (Admin)</strong>
                <span>Auto-Dispatch điều phối 3 phút, cấu hình VietQR & hoa hồng Host</span>
              </div>
              <ChevronRight size={18} className="muted" />
            </Link>
          </section>
        )}
      </main>

      {/* ── 3. Bottom Navigation Bar Đáy Màn Hình ─────────────────── */}
      <MobileBottomNav activeTab={tab} onTabChange={(t) => setTab(t as MobileTab)} />
    </div>
  );
}
