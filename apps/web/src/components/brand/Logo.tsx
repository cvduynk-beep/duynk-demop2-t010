import Link from "next/link";

/**
 * Biểu tượng Tối giản: Khối toà nhà hiện đại với duy nhất 1 ô cửa sổ ấm áp sáng đèn.
 * Mang thông điệp: "VinStay AI tìm ra đúng căn nhà hoàn hảo sáng đèn đón bạn".
 */
export function LogoMark({ size = 30, inverse = false }: { size?: number; inverse?: boolean }) {
  const body = inverse ? "#ffffff" : "#0a3d4a";
  const lit = "#e0a03c";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden focusable="false">
      {/* Khối toà nhà tối giản bo góc mềm mại */}
      <rect x="5.5" y="3" width="21" height="26" rx="6" fill={body} />
      {/* Duy nhất 1 ô cửa sổ ấm áp sáng đèn ở tầng cao */}
      <rect x="15.5" y="7.5" width="7" height="7" rx="2" fill={lit} />
    </svg>
  );
}

export function Logo({
  href = "/",
  inverse = false,
  sub,
  size = 28,
  compact = false,
}: {
  href?: string;
  inverse?: boolean;
  sub?: string;
  size?: number;
  compact?: boolean;
}) {
  const markSize = compact ? 24 : size;
  const fontSize = compact ? 17 : (size === 28 ? 19.5 : Math.round(size * 0.68));

  return (
    <Link
      href={href}
      aria-label="VinStay AI — trang chủ"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 8 : 10,
        textDecoration: "none",
      }}
    >
      <LogoMark size={markSize} inverse={inverse} />
      <span
        style={{
          fontFamily: "var(--font-head)",
          fontWeight: 800,
          fontSize,
          letterSpacing: "-0.03em",
          color: inverse ? "#ffffff" : "var(--ink)",
          whiteSpace: "nowrap",
          lineHeight: 1,
        }}
      >
        VinStay<span style={{ color: "var(--amber)", marginLeft: 2 }}>AI</span>
      </span>
    </Link>
  );
}
