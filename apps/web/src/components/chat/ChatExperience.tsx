"use client";

import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, Plus, ReceiptText, Footprints, MapPin, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { chatApi, chatErrorText, historyOf, recommendQuery, type RankedCost } from "@/lib/chat/api";
import { chatAppend, chatPatch, chatReset, chatSetConversation, chatSetCriteria, chatSetSearch, useChat } from "@/lib/chat/store";
import type { ChatMessage, CriteriaState } from "@/lib/chat/types";
import { DEFAULT_HOUSEHOLD, type CostBreakdown } from "@/lib/pricing/cost";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { useCatalog } from "@/lib/tenant/catalog";
import { emptyCriteria } from "@/lib/tenant/matchmaker";
import { useRole, useSession } from "@/lib/auth/client";
import { clientRandomIndex, useClientValue } from "@/lib/useClientValue";
import { ButlerMascot, VINNY_GREETINGS, type MascotMood } from "@/components/mascot/ButlerMascot";
import { Composer } from "./Composer";
import { InlineChatUnits } from "./InlineChatUnits";
import { Messages } from "./Messages";
import { ResultsPanel, type RankedResult } from "./ResultsPanel";
import styles from "./ChatExperience.module.css";

const TRUST = [
  { icon: BadgeCheck, text: "Ảnh thật, có mốc thời gian" },
  { icon: ReceiptText, text: "All-in Cost, không phí ẩn" },
  { icon: Footprints, text: "Host đón tại sảnh" },
  { icon: CalendarClock, text: "Giữ căn qua VietQR" },
];

/** URL yêu cầu mở thẳng danh mục căn (`?view=all`, `?catalog=1`, `?tab=results`). */
function urlWantsResults(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("view") === "all" || params.get("catalog") === "1" || params.get("tab") === "results";
}

const toCost = (c: RankedCost): CostBreakdown => ({
  rent: c.baseRent,
  mgmt: c.managementFee,
  parking: c.parkingFee,
  utility: c.utilityCost,
  total: c.allInTotal,
});

/**
 * Trang chủ khách thuê: ban đầu là hero + khung chat; khi bắt đầu tìm căn, chat thu về cột trái và mở màn kết quả.
 * Mọi lượt chat đi qua `POST /api/v1/chat` (backend phân tích câu, AI Matchmaker xếp hạng, Gemini chỉ giải thích);
 * tab kết quả dùng `POST /api/v1/matchmaker/recommend` — cùng một thuật toán xếp hạng, FE không tự xếp.
 */
export function ChatExperience({ below }: { below: ReactNode }) {
  const chat = useChat();
  const role = useRole();
  const [thinking, setThinking] = useState<{ steps: string[] } | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "results">("chat");
  // `/?view=all` (hoặc `catalog=1`, `tab=results`) mở thẳng tab kết quả — đọc URL ở trình duyệt, áp một lần khi render.
  const wantsResults = useClientValue(urlWantsResults, false);
  const [appliedUrlTab, setAppliedUrlTab] = useState(false);
  if (wantsResults && !appliedUrlTab) {
    setAppliedUrlTab(true);
    setTab("results");
  }
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  // Đang xem chi tiết căn trong khung kết quả ⇒ khung đó thôi cuộn cả khối, để header / thanh hành động đứng yên.
  const [previewOpen, setPreviewOpen] = useState(false);
  // Backend trả 401 LOGIN_REQUIRED khi khách vãng lai hết lượt (đếm ở server theo IP).
  const [guestLocked, setGuestLocked] = useState(false);
  const busy = useRef(false);
  const workspace = chat.searched;

  const { units: catalog, available } = useCatalog();
  const openCount = available.length;
  const byCode = useMemo(() => new Map(catalog.map((u) => [u.code, u])), [catalog]);

  const resultsQuery = useApiQuery(recommendQuery(chat.criteria), workspace);
  const results = useMemo<RankedResult[]>(() => {
    if (resultsQuery.state.status !== "ready") return [];
    return resultsQuery.state.data.topRecommendations.flatMap((r) => {
      const unit = byCode.get(r.unitCode);
      return unit ? [{ unit, rank: r.rank, cost: toCost(r.allInCost), reasons: [r.aiExplanation] }] : [];
    });
  }, [resultsQuery.state, byCode]);

  // Băng chuyền "Căn hời" ở hero: top theo thứ hạng matchmaker, chỉ căn được backend gắn cờ tiết kiệm ≥ 10%.
  const heroQuery = useApiQuery(recommendQuery(emptyCriteria()), !workspace);
  const initialBargainUnitIds = useMemo(
    () =>
      heroQuery.state.status === "ready"
        ? heroQuery.state.data.topRecommendations
            .filter((r) => r.comparison.isBargain)
            .slice(0, 4)
            .map((r) => r.unitCode)
        : [],
    [heroQuery.state],
  );

  const mascotMood: MascotMood = thinking
    ? "thinking"
    : freshId
    ? "happy"
    : isTyping
    ? "listening"
    : "idle";

  const locked = role === null && guestLocked;
  const { user } = useSession();
  const first = role === "tenant" ? (user?.fullName?.split(" ").slice(-1)[0] ?? null) : null;
  // Chọn ngẫu nhiên 1 trong các câu chào của Vinny khi vào trang (chỉ ở trình duyệt); bấm vào robot để xoay vòng.
  const greetingStart = useClientValue(() => clientRandomIndex(VINNY_GREETINGS.length), 0);
  const [greetingOffset, setGreetingOffset] = useState(0);
  const greetingIdx = (greetingStart + greetingOffset) % VINNY_GREETINGS.length;

  const activeGreeting = VINNY_GREETINGS[greetingIdx];
  const greeting = first ? `Chào ${first}! ${activeGreeting}` : activeGreeting;

  const onSend = async (text: string) => {
    if (busy.current || locked) return;
    busy.current = true;
    const base = chat.criteria;
    const searchedBefore = chat.searched || chat.messages.some((m) => m.criteria);
    // Ngữ cảnh 6 lượt gần nhất (server chỉ dùng làm ngữ cảnh, không lưu nội dung).
    const history = historyOf(chat.messages);
    try {
      chatAppend({ role: "user", text });
      setThinking({
        steps: [
          `Quét ${openCount} căn đang mở tại Ocean Park 1`,
          "AI Matchmaker lọc theo All-in và xếp hạng",
          "Trợ lý giải thích lựa chọn cho bạn",
        ],
      });

      const res = await chatApi.send(text, base, searchedBefore, chat.conversationId, history);
      if (!res.ok) {
        if (res.status === 401 || res.code === "LOGIN_REQUIRED") setGuestLocked(true);
        setFreshId(chatAppend({ role: "assistant", text: chatErrorText(res) }));
        return;
      }
      const data = res.data;
      chatSetConversation(data.conversationId);

      const meta = { serverId: data.messageId, promptVersion: data.promptVersion, kind: data.kind, handoff: data.handoff };
      // Lượt tìm căn: bộ phân tích câu (có `criteria`) hoặc Vinny tự gọi công cụ tìm căn (chỉ có `recommendations`).
      if (data.kind === "search" && (data.criteria || data.recommendations.length)) {
        const criteria: CriteriaState = data.criteria ? { ...base, ...data.criteria } : base;
        if (data.criteria) chatSetCriteria(criteria);
        setFreshId(
          chatAppend({
            role: "assistant",
            text: data.reply,
            // Đúng thứ hạng backend trả — không sắp lại.
            resultIds: data.recommendations.map((r) => r.id),
            criteria,
            degraded: data.degraded,
            ...meta,
          }),
        );
        // Ở workspace thì chuyển sang tab kết quả; ở hero giữ nguyên để khách xem băng chuyền ngay trong khung chat.
        if (workspace && data.recommendations.length && data.criteria) setTab("results");
      } else {
        setFreshId(chatAppend({ role: "assistant", text: data.reply, degraded: data.degraded, ...meta }));
      }
    } finally {
      setThinking(null);
      busy.current = false;
    }
  };

  const onFeedback = async (m: ChatMessage, rating: "up" | "down", reason?: string) => {
    if (!m.serverId || !m.promptVersion || !chat.conversationId) return;
    chatPatch(m.id, { feedback: rating });
    const res = await chatApi.feedback({ messageId: m.serverId, conversationId: chat.conversationId, rating, reason, promptVersion: m.promptVersion, kind: m.kind });
    if (!res.ok) chatPatch(m.id, { feedback: undefined });
  };

  const onHandoff = async (m: ChatMessage) => {
    if (!m.handoff || m.handoff.requested || !chat.conversationId) return;
    const messages = chat.messages.filter((x) => x.role === "user").slice(-4).map((x) => x.text);
    const res = await chatApi.handoff({ conversationId: chat.conversationId, category: m.handoff.category, messages });
    if (!res.ok) {
      setFreshId(chatAppend({ role: "assistant", text: chatErrorText(res) }));
      return;
    }
    chatPatch(m.id, { handoff: { ...m.handoff, requested: true } });
    setFreshId(
      chatAppend({
        role: "assistant",
        text: res.data.created
          ? `Mình đã chuyển yêu cầu kèm tóm tắt cho nhân viên VinStay. Nhân viên sẽ liên hệ bạn qua số điện thoại đã xác thực trong ${res.data.sla}.`
          : `Yêu cầu của bạn đã được ghi nhận trước đó và đang chờ xử lý. Nhân viên sẽ liên hệ trong ${res.data.sla}.`,
      }),
    );
  };

  const handleViewAllUnits = () => {
    chatSetSearch({ layouts: [], zones: [], buildings: [], items: [], household: { ...DEFAULT_HOUSEHOLD } });
    setTab("results");
    if (typeof window !== "undefined") {
      try {
        window.history.pushState(null, "", "/?view=all");
      } catch {}
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handleEvent = () => {
      handleViewAllUnits();
    };
    window.addEventListener("vinstay:view-all-units", handleEvent);

    if (urlWantsResults()) {
      chatSetSearch({ layouts: [], zones: [], buildings: [], items: [], household: { ...DEFAULT_HOUSEHOLD } });
    }

    return () => {
      window.removeEventListener("vinstay:view-all-units", handleEvent);
    };
  }, []);

  const renderedBelow = isValidElement(below)
    ? cloneElement(below as ReactElement<{ onViewAll?: () => void }>, { onViewAll: handleViewAllUnits })
    : below;

  const onCriteria = (c: CriteriaState) => chatSetCriteria(c);

  if (!workspace) {
    return (
      <>
        <section className={styles.hero}>
          <div className={`wrap ${styles.heroInner}`}>
            <div className={styles.heroTop}>
              <span className={styles.liveBadge}>
                <i className={styles.liveDot} /> <strong className="num">{openCount} căn</strong> đang mở tại Ocean Park 1
              </span>
              <h1 className={styles.h1}>Căn hộ thật ở Ocean Park, tìm ra trong 30 giây</h1>
              <p className={styles.lead}>Không tin ảo, không phí ẩn, không môi giới làm phiền — Host nội khu đón bạn tận sảnh.</p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "2px" }}>
                <button
                  type="button"
                  onClick={() => {
                    chatSetSearch(chat.criteria);
                    setTab("results");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "rgba(255, 255, 255, 0.88)",
                    backdropFilter: "blur(16px)",
                    border: "1px solid rgba(255, 255, 255, 0.95)",
                    borderRadius: "999px",
                    padding: "10px 22px",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#0a3d4a",
                    boxShadow: "0 8px 24px -4px rgba(10, 61, 74, 0.16)",
                    cursor: "pointer",
                  }}
                >
                  <MapPin size={16} /> Mở Bản đồ Kính mờ & Rổ hàng ({openCount} căn)
                </button>
              </div>
            </div>

            <div className={styles.chatWrapper}>
              {/* Linh vật Mascot đứng cố định tự nhiên ở góc trên bên phải khung chat, không đè lên chữ */}
              <div className={styles.fixedHeroMascot}>
                <ButlerMascot
                  size="hero"
                  mood={mascotMood}
                  autoSpeak={!isTyping && !thinking}
                />
              </div>

              <div className={styles.chatCard}>
                <div className={styles.chatHead}>
                  <ButlerMascot size="mini" mood={mascotMood} />
                  <div className={styles.chatHeadText}>
                    <strong>VinStay AI · Quản Gia Số</strong>
                    <span>
                      <i className={styles.liveDot} /> Đang trực tuyến · Sẵn sàng mở cửa & đón tận sảnh
                    </span>
                  </div>
                </div>
                <div className={styles.convo}>
                  <Messages
              onFeedback={onFeedback}
              onHandoff={onHandoff}
              signedIn={role === "tenant"}
                    greeting={greeting}
                    messages={chat.messages}
                    thinking={thinking}
                    freshId={freshId}
                    onFreshDone={() => setFreshId(null)}
                    onShowResults={handleViewAllUnits}
                  />
                </div>
                <div className={styles.chatFoot}>
                  <Composer
                    variant="hero"
                    criteria={chat.criteria}
                    onCriteria={onCriteria}
                    onSend={onSend}
                    onTyping={setIsTyping}
                    busy={!!thinking}
                    locked={locked}
                    guestNotice={false}
                    showPrompts={chat.messages.length === 0}
                  />
                </div>
              </div>
            </div>

            {/* BĂNG CHUYỀN NẰM RIÊNG BÊN DƯỚI (PHƯƠNG ÁN 1) */}
            <div className={styles.showcaseSection}>
              <div className={styles.showcaseHead}>
                <div className={styles.showcaseTitle}>
                  <Sparkles size={15} />
                  <span>Căn hời phân khu nổi bật hôm nay (Tiết kiệm ≥ 10%)</span>
                </div>
                <button
                  type="button"
                  className={styles.showcaseAllBtn}
                  onClick={handleViewAllUnits}
                  aria-label="Xem toàn bộ rổ hàng"
                >
                  <span>Xem tất cả {openCount} căn</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              <InlineChatUnits
                unitIds={initialBargainUnitIds}
                onShowResults={handleViewAllUnits}
                title="Top deals mở thuê tại Ocean Park"
              />
            </div>

            <ul className={styles.trust}>
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text}>
                  <Icon size={18} /> {text}
                </li>
              ))}
            </ul>
          </div>
        </section>
        {renderedBelow}
      </>
    );
  }

  return (
    <div className={`${styles.workspace} ${railCollapsed ? styles.workspaceCollapsed : ""} ${tab === "results" ? styles.showResults : styles.showChat}`}>
      <div className={styles.tabs} role="tablist" aria-label="Chuyển giữa trò chuyện và kết quả">
        <button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
          Trò chuyện
        </button>
        <button type="button" role="tab" aria-selected={tab === "results"} onClick={() => setTab("results")}>
          Kết quả ({results.length})
        </button>
      </div>

      {railCollapsed && (
        <button
          type="button"
          className={styles.openAiPill}
          onClick={() => setRailCollapsed(false)}
          aria-label="Mở Trợ lý VinStay AI"
        >
          <span className={styles.openAiOrb}>
            <Sparkles size={16} />
          </span>
          <span className={styles.openAiLabel}>
            <strong>Trợ lý VinStay AI</strong>
            <span>Hỏi tiếp hoặc chỉnh yêu cầu ({results.length} căn khớp)</span>
          </span>
          <PanelLeftOpen size={16} />
        </button>
      )}

      {!railCollapsed && (
        <aside className={styles.rail} aria-label="Trò chuyện với VinStay AI">
          <div className={styles.railHead}>
            <div className={styles.railHeadBrand}>
              <ButlerMascot size="mini" mood={mascotMood} />
              <div>
                <div className={styles.aiStatusTitle}>
                  <strong>VinStay AI · Quản Gia</strong>
                  <span className={styles.aiLiveDot} title="Đang trực tuyến" />
                </div>
                <span className={styles.aiStatusSub}>Trợ lý All-in Cost · Ocean Park 1</span>
              </div>
            </div>

            <div className={styles.railHeadActions}>
              <button
                type="button"
                className={styles.railActionBtn}
                onClick={() => {
                  chatReset();
                  setGreetingOffset((prev) => prev + 1);
                }}
                title="Bắt đầu cuộc trò chuyện mới"
              >
                <Plus size={14} /> Mới
              </button>
              <button
                type="button"
                className={styles.railActionBtn}
                onClick={() => setRailCollapsed(true)}
                title="Thu gọn bảng trợ lý để mở rộng toàn màn hình"
                aria-label="Thu gọn trợ lý"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
          </div>
          <div className={styles.railMsgs}>
            <Messages
              onFeedback={onFeedback}
              onHandoff={onHandoff}
              signedIn={role === "tenant"}
              greeting={greeting}
              messages={chat.messages}
              thinking={thinking}
              freshId={freshId}
              onFreshDone={() => setFreshId(null)}
              onShowResults={() => setTab("results")}
              hideInlineUnits={true}
            />
          </div>
          <div className={styles.railFoot}>
            <Composer variant="rail" criteria={chat.criteria} onCriteria={onCriteria} onSend={onSend} onTyping={setIsTyping} busy={!!thinking} locked={locked} guestNotice={false} />
          </div>
        </aside>
      )}

      <section className={`${styles.results} ${previewOpen ? styles.resultsFlush : ""}`} aria-label="Kết quả tìm căn">
        <ResultsPanel
          onPreviewChange={setPreviewOpen}
          results={results}
          criteria={chat.criteria}
          onCriteria={onCriteria}
          totalOpen={openCount}
          loading={resultsQuery.state.status === "loading"}
          error={resultsQuery.state.status === "error" ? resultsQuery.state.message : null}
          onRetry={resultsQuery.reload}
        />
      </section>
    </div>
  );
}
