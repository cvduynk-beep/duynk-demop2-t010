import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { ToastHost } from "@/components/ui/Toast";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import "./globals.css";

// Một họ chữ duy nhất cho toàn bộ giao diện: Be Vietnam Pro được thiết kế cho dấu tiếng Việt.
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "VinStay AI — Thuê căn hộ Vinhomes Ocean Park", template: "%s — VinStay AI" },
  description: "Tìm căn thật, biết trước mọi chi phí hàng tháng, xem nhà có Field Host đón tại sảnh. Vinhomes Ocean Park 1, Gia Lâm, Hà Nội.",
  applicationName: "VinStay AI",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VinStay AI",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A3D4A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnamPro.variable} data-scroll-behavior="smooth">
      <body>
        {children}
        <ToastHost />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
