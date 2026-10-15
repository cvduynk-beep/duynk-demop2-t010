"use client";

import Link from "next/link";
import { useState } from "react";
import { Bath, BedDouble, Bot, Building2, CalendarPlus, Check, Compass, Layers, LockKeyhole, Minus, Plus, Ruler, Share2, ShieldCheck, Sofa, Star, Zap } from "lucide-react";
import { BookingSheet } from "@/components/booking/BookingSheet";
import { toast } from "@/components/ui/Toast";
import { allInCost, DEFAULT_HOUSEHOLD, isBargain, RATES, savingsPct, type Household, unitRates } from "@/lib/pricing/cost";
import { vnd, vndShort } from "@/lib/format";
import { HOUSE_RULES } from "@/lib/legal/house-rules";
import { useChat } from "@/lib/chat/store";
import { useApiQuery } from "@/lib/query/useApiQuery";
import { tenantQueries } from "@/lib/tenant/queries";
import type { UnitWithExtras } from "@/lib/tenant/adapters";
import { similarUnits, useCatalog } from "@/lib/tenant/catalog";
import { FURNISHING_LABEL, ITEM_LABEL, PASSPORT_ITEMS, unitAddress, zoneById } from "@/lib/units";
import { getBuildingPerks } from "@/lib/property/livingIntelligence";
import { AllInBar } from "./AllInBar";
import { FastCloseModal } from "./FastCloseModal";
import { FavoriteButton } from "./FavoriteButton";
import { Gallery } from "./Gallery";
import { LivingExperience } from "./LivingExperience";
import { LocationMap } from "./LocationMap";
import { UnitBadges } from "./UnitBadges";
import { UnitCard } from "./UnitCard";
import { UnitConciergeDrawer } from "./UnitConciergeDrawer";
import styles from "./UnitDetail.module.css";

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className={styles.step}>
      <span>{label}</span>
      <div>
        <button type="button" className="icon-btn" aria-label={`Giảm ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={15} />
        </button>
        <b className="num">{value}</b>
        <button type="button" className="icon-btn" aria-label={`Tăng ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

export function UnitDetail({
  unit,
  autoOpenBooking,
  autoOpenFastDeposit = false,
}: {
  unit: UnitWithExtras;
  autoOpenBooking: boolean;
  autoOpenFastDeposit?: boolean;
}) {
  const chat = useChat();
  const catalog = useCatalog();
  const zoneName = unit.zoneName || zoneById(unit.zoneId)?.name || "Ocean Park 1";
  // Trạng thái căn đến thẳng từ backend (DB): available / holding / rented.
  const status = unit.baseStatus;
  const [hh, setHh] = useState<Household>(chat.criteria.household ?? DEFAULT_HOUSEHOLD);
  const [booking, setBooking] = useState(autoOpenBooking);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const buildingPerks = getBuildingPerks(unit.building, unit.zoneId);
  const cost = allInCost(unit, hh);
  const sv = savingsPct(unit);
  const bookable = status === "available";
  // Chốt cọc nhanh: chỉ căn chủ nhà ủy quyền + còn trống (backend quyết, không lộ giá sàn). Lỗi tải ⇒ ẩn nút.
  const fastQuery = useApiQuery(tenantQueries.fastDeposit(unit.code), bookable);
  const fastDeposit = bookable && fastQuery.state.status === "ready" && fastQuery.state.data.eligible ? fastQuery.state.data : null;
  const [fastOpen, setFastOpen] = useState(autoOpenFastDeposit);
  const holdHours = unit.holdHours;
  const mgmtPerM2 = unit.managementFee && unit.areaM2 > 0 ? Math.round(unit.managementFee / unit.areaM2) : RATES.mgmtPerM2;
  const rates = unitRates(unit);
  const similar = similarUnits(catalog.units, unit, 3);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: unitAddress(unit), url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Đã sao chép liên kết căn hộ", "success");
      }
    } catch {
      /* người dùng đóng hộp thoại chia sẻ */
    }
  };

  const stats = [
    { icon: Ruler, label: "Diện tích", value: `${unit.areaM2} m²` },
    { icon: BedDouble, label: "Phòng ngủ", value: unit.layoutLabel },
    { icon: Bath, label: "Vệ sinh", value: `${unit.bathrooms} WC` },
    ...(unit.directionRaw ? [{ icon: Compass, label: "Hướng", value: unit.directionRaw }] : []),
    { icon: Layers, label: "Tầng", value: `Tầng ${unit.floor}` },
    { icon: Sofa, label: "Nội thất", value: FURNISHING_LABEL[unit.furnishing] },
  ];

  return (
    <div className={`wrap ${styles.page}`}>
      <nav className={`small muted ${styles.crumbs}`} aria-label="Đường dẫn">
        <Link href="/">Trang chủ</Link> / <span>{zoneName}</span>
      </nav>

      <Gallery unit={unit} />

      <div className={styles.grid}>
        <div className={styles.main}>
          <header className={styles.head}>
            <div className={styles.badges}>
              <UnitBadges unit={unit} />
              <span className="badge badge-kelp">
                <ShieldCheck size={12} /> Đã xác minh
              </span>
            </div>
            <div className={styles.titleRow}>
              <div>
                <h1 className={styles.h1}>{unitAddress(unit)}</h1>
                <p className="muted">
                  {zoneName}
                  {unit.view && unit.view !== "Chưa cập nhật" ? ` · ${unit.view}` : ""} · mã {unit.code}
                </p>
              </div>
              <div className={styles.headActions}>
                <FavoriteButton unitCode={unit.code} variant="plain" />
                <button type="button" className="icon-btn" aria-label="Chia sẻ căn hộ" onClick={share}>
                  <Share2 size={20} />
                </button>
              </div>
            </div>
          </header>

          <ul className={styles.stats}>
            {stats.map(({ icon: Icon, label, value }) => (
              <li key={label}>
                <Icon size={18} />
                <span className="muted xs">{label}</span>
                <b>{value}</b>
              </li>
            ))}
          </ul>

          <section className={styles.block}>
            <h2>Trải nghiệm sống &amp; Kết nối thực tế</h2>
            <LivingExperience unit={unit} criteria={chat.criteria} />
          </section>

          <section className={styles.block} aria-labelledby="allin">
            <h2 id="allin">Minh bạch chi phí sinh hoạt (Xác thực thực địa)</h2>
            <div className={styles.cost}>
              <div>
                <div className={styles.costTotal}>
                  <span className={`num ${styles.costNum}`}>{vnd(unit.rent)}</span>
                  <span className="muted">đ/tháng (tiền thuê)</span>
                </div>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  Tiền thuê cố định thanh toán cho Chủ nhà. Các khoản phí quản lý, xe, điện nước khách nộp trực tiếp cho BQL và EVN (Sale/Host hỗ trợ hướng dẫn đăng ký tại Lễ tân sảnh tầng 1 lúc nhận nhà).
                </p>
                <AllInBar cost={cost} variant="table" />
                {isBargain(unit) && (
                  <p className={`small ${styles.deal}`}>
                    Giá thuê {vndShort(unit.rent)} thấp hơn giá trung bình toà {vndShort(unit.marketAvg)} cùng layout: rẻ hơn {sv}%.
                  </p>
                )}
              </div>
              <div className={styles.steppers}>
                <p className="label">Dự toán theo nhu cầu sinh hoạt của bạn</p>
                <Stepper label="Số người ở" value={hh.persons} min={1} max={6} onChange={(n) => setHh({ ...hh, persons: n })} />
                <Stepper label="Xe máy" value={hh.motorbikes} min={0} max={4} onChange={(n) => setHh({ ...hh, motorbikes: n })} />
                <Stepper label="Ô tô" value={hh.cars} min={0} max={2} onChange={(n) => setHh({ ...hh, cars: n })} />
                <p className="muted xs">
                  Biểu phí căn {unit.code}: Phí quản lý {vnd(mgmtPerM2)}đ/m² · xe máy {vndShort(rates.motorbike)}/xe · ô tô {vndShort(rates.car)}/xe · điện nước EVN tính theo công tơ thực tế.
                  {unit.motorbikeFee != null && " Biểu phí đã được Field Host xác minh tại tòa."}
                </p>
                {unit.feeNote && <p className="muted xs">Phí khác / tiện ích: {unit.feeNote}</p>}
              </div>
            </div>
          </section>

          <section className={styles.block}>
            <div>
              <h2>Nội thất và trang thiết bị thực tế</h2>
              <p className="muted xs">
                Dữ liệu đối chiếu từ Biên bản thẩm định của Field Host nội khu · Hiện trạng {FURNISHING_LABEL[unit.furnishing]}
              </p>
            </div>

            {unit.inventory.length > 0 ? (
              <ul className={styles.items}>
                {unit.inventory.map((item) => (
                  <li key={item.code}>
                    <Check size={16} />
                    <span>
                      {item.name}
                      {item.qty > 1 ? ` ×${item.qty}` : ""}
                    </span>
                    {typeof item.conditionPct === "number" && (
                      <b className="muted xs" style={{ marginLeft: 4 }}>({item.conditionPct}% mới)</b>
                    )}
                  </li>
                ))}
                {unit.petFriendly && (
                  <li>
                    <Check size={16} /> Cho nuôi thú cưng nhỏ
                  </li>
                )}
              </ul>
            ) : (
              <ul className={styles.items}>
                {unit.items.map((i) => (
                  <li key={i}>
                    <Check size={16} /> {ITEM_LABEL[i]}
                  </li>
                ))}
                {unit.petFriendly && (
                  <li>
                    <Check size={16} /> Cho nuôi thú cưng nhỏ
                  </li>
                )}
              </ul>
            )}

            <h3>Tiện ích toà nhà {unit.building}</h3>
            <ul className={`${styles.items} ${styles.perks}`}>
              {buildingPerks.map((p) => (
                <li key={p}>
                  <Building2 size={15} /> {p}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.block}>
            <h2>Hộ chiếu bàn giao số</h2>
            <p className="muted">
              Lúc nhận nhà, Field Host và bạn cùng chụp ảnh có dấu thời gian cho 10 hạng mục dưới đây. Đây là căn cứ đối soát khi trả phòng: hao mòn tự nhiên không bị trừ cọc.
            </p>
            <ul className={styles.passport}>
              {PASSPORT_ITEMS.map((p, i) => (
                <li key={p}>
                  <span className="num">{i + 1}</span> {p}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.block}>
            <h2>Vị trí trong Ocean Park 1</h2>
            <LocationMap zoneId={unit.zoneId} building={unit.building} />
            <a className="link small" href="https://www.google.com/maps/search/?api=1&query=Vinhomes+Ocean+Park+Gia+Lam" target="_blank" rel="noreferrer">
              Mở Google Maps
            </a>
          </section>

          <section className={styles.block}>
            <h2>Điều khoản thuê</h2>
            <dl className={styles.terms}>
              <div>
                <dt>Kỳ hạn tối thiểu</dt>
                <dd>{unit.minMonths} tháng</dd>
              </div>
              <div>
                <dt>Tiền cọc bảo đảm</dt>
                <dd>{vnd(unit.securityDeposit)}đ, giữ nguyên suốt kỳ thuê và hoàn lại khi trả nhà</dd>
              </div>
              <div>
                <dt>Cọc khi chốt căn</dt>
                <dd>Chuyển ngay {vnd(unit.holdingDeposit)}đ (chính là tiền cọc bảo đảm) qua VietQR. Căn được giữ riêng cho bạn {holdHours} giờ kể từ khi ngân hàng báo có; khi ký hợp đồng, khoản này chuyển 100% vào tiền cọc bảo đảm, không nộp bù, không trừ vào tiền thuê tháng đầu</dd>
              </div>
              <div>
                <dt>Nếu không ký hợp đồng</dt>
                <dd>Không ký trong {holdHours} giờ vì lý do cá nhân thì xử lý cọc theo Điều 328 BLDS (50% bù chủ nhà, 50% phí vận hành). Nếu chủ nhà bẻ cọc đền gấp đôi, bất khả kháng hoàn 100% trong 24 giờ làm việc</dd>
              </div>
              <div>
                <dt>Nội quy BQL</dt>
                <dd>Yên tĩnh sau 22:00 · vi phạm bị BQL phạt sẽ trừ vào cọc bảo đảm · đăng ký tạm trú khi vào ở</dd>
              </div>
              <div>
                <dt>Sửa chữa</dt>
                <dd>VinStay chỉ giới thiệu danh bạ thợ ngoài uy tín, bạn và thợ tự thoả thuận giá</dd>
              </div>
            </dl>
          </section>

          <section className={styles.block}>
            <h2>Nội quy căn hộ</h2>
            <dl className={styles.terms}>
              {HOUSE_RULES.map((rule) => (
                <div key={rule.id}>
                  <dt>{rule.title}</dt>
                  <dd>{rule.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={`${styles.block} ${styles.hostCard}`}>
            <span className={styles.hostAvatar}>
              <Star size={18} />
            </span>
            <div>
              <h2>Field Host nội khu {zoneName} dẫn xem</h2>
              <p className="muted">
                Có thẻ cư dân thang máy · nhận lịch trong ≤ 3 phút. Tên và đánh giá của Host phụ trách hiện trong lịch hẹn ngay khi
                Host xác nhận. Số điện thoại chủ nhà được ẩn; mọi liên lạc đi qua Zalo VinStay.
              </p>
            </div>
          </section>
        </div>

        <aside className={styles.side} aria-label="Đặt lịch xem phòng">
          <div className={`card ${styles.book}`}>
            <div className={styles.bookPrice}>
              <span className={`num ${styles.bookNum}`}>{vnd(unit.rent)}</span>
              <span className="muted small">đ/tháng (thuê)</span>
            </div>
            <p className="muted small">
              Thanh toán cho Chủ nhà theo hợp đồng (chưa bao gồm phí quản lý &amp; dịch vụ).
            </p>

            {bookable ? (
              <>
                {fastDeposit && (
                  <button type="button" className={styles.fastBtn} onClick={() => setFastOpen(true)}>
                    <span className={styles.fastMain}>
                      <Zap size={17} /> Chốt cọc nhanh
                      {fastDeposit.depositDiscount > 0 && <span className={styles.fastBadge}>Giảm {vnd(fastDeposit.depositDiscount)}đ</span>}
                    </span>
                    <span className={styles.fastSub}>Khóa giữ căn {fastDeposit.holdHours} giờ · Không cần xem trực tiếp</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`btn ${fastDeposit ? "btn-quiet" : "btn-primary"} btn-lg btn-block`}
                  onClick={() => setBooking(true)}
                >
                  <CalendarPlus size={19} /> Đặt lịch xem phòng
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-block"
                  onClick={() => setConciergeOpen(true)}
                >
                  <Bot size={17} /> Hỏi Quản gia Vinny về căn này
                </button>
                <ul className={styles.promises}>
                  <li>
                    <Check size={15} /> Xem phòng miễn phí, Host đón tại sảnh
                  </li>
                  <li>
                    <Check size={15} />{" "}
                    {fastDeposit ? "Ưng ý qua ảnh thực tế? Chốt cọc nhanh, không cần đi xem" : "Chỉ đặt cọc khi bạn đã xem và ưng ý"}
                  </li>
                  <li>
                    <Check size={15} /> Mã cửa chỉ hiện đúng lúc đứng trước phòng
                  </li>
                </ul>
              </>
            ) : (
              <div className={styles.taken}>
                <LockKeyhole size={20} />
                <div>
                  <b>{status === "holding" ? `Căn đang được giữ chỗ (${holdHours} giờ)` : "Căn đã cho thuê"}</b>
                  <p className="muted small">Không nhận thêm lịch xem. Xem các căn tương đương bên dưới hoặc hỏi VinStay AI để được gợi ý.</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className={styles.similar} aria-label="Căn tương tự">
          <h2>Căn tương tự cùng layout</h2>
          <div className={styles.similarGrid}>
            {similar.map((u) => (
              <UnitCard key={u.code} unit={u} cost={allInCost(u, hh)} />
            ))}
          </div>
        </section>
      )}

      {bookable && (
        <div className={`${styles.bar} no-print`}>
          <div>
            <b className="num">{vnd(unit.rent)}đ</b>
            <span className="muted xs"> /tháng (thuê) · Chưa bao gồm phí quản lý</span>
          </div>
          <div className={styles.barActions}>
            {fastDeposit && (
              <button type="button" className={styles.barFast} onClick={() => setFastOpen(true)}>
                <Zap size={14} /> Cọc nhanh
                {fastDeposit.depositDiscount > 0 && <span className={styles.barFastBadge}>−{vndShort(fastDeposit.depositDiscount)}</span>}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setBooking(true)}>
              Đặt lịch xem
            </button>
          </div>
        </div>
      )}
      {fastDeposit && <FastCloseModal unit={unit} quote={fastDeposit} open={fastOpen} onClose={() => setFastOpen(false)} />}

      <BookingSheet unit={unit} open={booking} onClose={() => setBooking(false)} />
      <UnitConciergeDrawer
        unit={unit}
        open={conciergeOpen}
        onOpen={() => setConciergeOpen(true)}
        onClose={() => setConciergeOpen(false)}
        onBook={() => setBooking(true)}
      />
    </div>
  );
}
