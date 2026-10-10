import type { Unit, ZoneId } from "@/lib/mock/units";
import type { CriteriaState } from "@/lib/mock/types";

export interface CommuteDestination {
  name: string;
  distanceM: number;
  walkMin: number;
  bikeMin: number;
  busInfo?: string;
  note?: string;
}

export interface BuildingKnowledge {
  building: string;
  zoneId: ZoneId;
  vinUni: CommuteDestination;
  technoPark: CommuteDestination;
  vinBusStation: {
    name: string;
    distanceM: number;
    walkMin: number;
    routes: string[];
  };
  parking: {
    motorbike: string;
    car: string;
  };
  groundPerks: string[];
  nearbyLandmarks: string[];
}

export interface UnitLivingInsights {
  commute: {
    vinUni: CommuteDestination;
    technoPark: CommuteDestination;
    vinBus: BuildingKnowledge["vinBusStation"];
    parking: BuildingKnowledge["parking"];
    groundPerks: string[];
    nearbyLandmarks: string[];
  };
  layoutInsight: {
    badge: string;
    title: string;
    description: string;
    plusOneHighlight?: string;
  };
  floorInsight: {
    level: "low" | "mid" | "high";
    title: string;
    description: string;
  };
  directionInsight: {
    direction: string;
    title: string;
    description: string;
  };
  bestFor: string[];
  contextMatch?: {
    matchedTarget: string;
    headline: string;
    summary: string;
  };
}

/**
 * Bản đồ vị trí thực tế bất biến của từng tòa nhà tại Vinhomes Ocean Park 1.
 * Dữ liệu đo đạc thực tế cự ly tới ĐH VinUni, tháp TechnoPark, trạm xe buýt và phương án gửi xe.
 */
export const BUILDING_GEO_REGISTRY: Record<string, Partial<BuildingKnowledge>> = {
  // ─── The Sapphire 1 (S1.01 – S1.12) ─────────────────────────
  "S1.01": {
    vinUni: { name: "Đại học VinUni", distanceM: 950, walkMin: 11, bikeMin: 4, busInfo: "VinBus OCP01 đón tại sảnh", note: "Chỉ 4 phút đạp xe qua đường Hải Đăng" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1100, walkMin: 13, bikeMin: 5 },
    vinBusStation: { name: "Trạm sảnh S1.01 - S1.02", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02", "E01"] },
    parking: { motorbike: "Hầm tòa nhà S1.01", car: "Nhà để xe nổi 5 tầng Sapphire 1 (cách 80m)" },
    nearbyLandmarks: ["Nhà để xe nổi 5 tầng", "Sân bóng đá & Tennis S1", "Công viên hồ San Hô"],
    groundPerks: ["WinMart+", "Circle K", "Nhà thuốc Pharmacity", "Cafe học tập"],
  },
  "S1.02": {
    vinUni: { name: "Đại học VinUni", distanceM: 920, walkMin: 11, bikeMin: 4, busInfo: "VinBus OCP01 sảnh tòa" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1050, walkMin: 12, bikeMin: 4 },
    vinBusStation: { name: "Trạm sảnh S1.02", distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S1.02", car: "Nhà để xe nổi 5 tầng Sapphire 1 (kế bên)" },
    nearbyLandmarks: ["Nhà để xe nổi 5 tầng", "Bể bơi ngoài trời", "Hồ San Hô"],
    groundPerks: ["WinMart+", "Tiệm giặt ủi", "Quán cơm văn phòng"],
  },
  "S1.03": {
    vinUni: { name: "Đại học VinUni", distanceM: 880, walkMin: 10, bikeMin: 3, busInfo: "VinBus OCP01 sảnh tòa" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1000, walkMin: 12, bikeMin: 4 },
    vinBusStation: { name: "Trạm sảnh S1.03", distanceM: 40, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà", car: "Nhà để xe nổi 5 tầng Sapphire 1" },
    nearbyLandmarks: ["Cụm sân thể thao", "Khu shophouse dịch vụ", "Hồ San Hô"],
    groundPerks: ["Circle K 24/7", "Highlands Coffee", "Spa & cắt tóc"],
  },
  "S1.05": {
    vinUni: { name: "Đại học VinUni", distanceM: 850, walkMin: 10, bikeMin: 3, busInfo: "VinBus OCP01 qua trục S1" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 950, walkMin: 11, bikeMin: 4 },
    vinBusStation: { name: "Trạm ngã tư Sapphire 1", distanceM: 60, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S1.05", car: "Nhà để xe nổi 5 tầng S1" },
    nearbyLandmarks: ["Bể bơi hình cá voi", "Vườn hoa nội khu", "Sân tennis"],
    groundPerks: ["WinMart+", "Phở Lý Quốc Sư", "Cafe học nhóm"],
  },
  "S1.06": {
    vinUni: { name: "Đại học VinUni", distanceM: 830, walkMin: 9, bikeMin: 3, busInfo: "VinBus OCP01" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 900, walkMin: 10, bikeMin: 3 },
    vinBusStation: { name: "Trạm sảnh S1.06", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S1.06", car: "Nhà để xe nổi 5 tầng S1" },
    nearbyLandmarks: ["Bể bơi cá voi", "Sân bóng rổ", "Công viên gym ngoài trời"],
    groundPerks: ["Siêu thị Fresh Market", "Nhà thuốc An Khang", "Quán bún chả"],
  },
  "S1.07": {
    vinUni: { name: "Đại học VinUni", distanceM: 820, walkMin: 9, bikeMin: 3, busInfo: "VinBus OCP01 đón sảnh" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 880, walkMin: 10, bikeMin: 3 },
    vinBusStation: { name: "Trạm sảnh S1.07", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S1.07", car: "Nhà để xe nổi 5 tầng S1" },
    nearbyLandmarks: ["Sân bóng đá mini", "Trường liên cấp Vinschool", "Bể bơi cá voi"],
    groundPerks: ["WinMart+", "Tiệm bánh Tous Les Jours", "Tiệm trà sữa"],
  },
  "S1.08": {
    vinUni: { name: "Đại học VinUni", distanceM: 800, walkMin: 8, bikeMin: 3, busInfo: "VinBus OCP01/02 đón ngay sảnh", note: "Chỉ 3 phút đạp xe hoặc bắt xe bus điện miễn phí tới cổng trường" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 850, walkMin: 9, bikeMin: 3, note: "5-6 phút di chuyển" },
    vinBusStation: { name: "Trạm xe buýt sảnh S1.08", distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02", "E01", "E02"] },
    parking: { motorbike: "Hầm để xe tòa S1.08", car: "Nhà để xe nổi 5 tầng Sapphire 1 kế bên" },
    nearbyLandmarks: ["Trường Vinschool (đối diện)", "Công viên Hồ San Hô", "Biển hồ nước mặn 6,1ha (500m)"],
    groundPerks: ["WinMart+", "Circle K 24/7", "Nhà thuốc Pharmacity", "Cafe học tập The Coffee House"],
  },
  "S1.09": {
    vinUni: { name: "Đại học VinUni", distanceM: 780, walkMin: 8, bikeMin: 3, busInfo: "VinBus OCP01/02 sảnh S1.09" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 820, walkMin: 9, bikeMin: 3 },
    vinBusStation: { name: "Trạm sảnh S1.09", distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S1.09", car: "Nhà để xe nổi 5 tầng Sapphire 1" },
    nearbyLandmarks: ["Trường liên cấp Vinschool", "Hồ San Hô", "Cụm shophouse ẩm thực"],
    groundPerks: ["WinMart+", "Tiệm cắt tóc 30Shine", "Highlands Coffee"],
  },
  "S1.10": {
    vinUni: { name: "Đại học VinUni", distanceM: 850, walkMin: 9, bikeMin: 3 },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 900, walkMin: 10, bikeMin: 4 },
    vinBusStation: { name: "Trạm sảnh S1.10", distanceM: 35, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa S1.10", car: "Nhà để xe nổi 5 tầng S1" },
    nearbyLandmarks: ["Hồ điều hòa San Hô", "Khu nướng BBQ ngoài trời"],
    groundPerks: ["Circle K", "Tiệm bánh ngọt", "Nhà thuốc"],
  },
  "S1.11": {
    vinUni: { name: "Đại học VinUni", distanceM: 920, walkMin: 10, bikeMin: 3 },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 980, walkMin: 11, bikeMin: 4 },
    vinBusStation: { name: "Trạm sảnh S1.11", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa S1.11", car: "Nhà để xe nổi 5 tầng S1" },
    nearbyLandmarks: ["Cận kề Biển hồ 6,1ha", "Bãi cát trắng nội khu"],
    groundPerks: ["WinMart+", "Cafe Trung Nguyên", "Quán bún cá"],
  },
  "S1.12": {
    vinUni: { name: "Đại học VinUni", distanceM: 1000, walkMin: 11, bikeMin: 4, note: "Điểm gần Biển hồ nước mặn nhất phân khu" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1050, walkMin: 12, bikeMin: 4 },
    vinBusStation: { name: "Trạm sảnh S1.12", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa S1.12", car: "Nhà để xe nổi 5 tầng S1" },
    nearbyLandmarks: ["Biển hồ nước mặn (chỉ 250m)", "Phố đi bộ biển hồ", "Quảng trường cá voi"],
    groundPerks: ["WinMart+", "Nhà hàng hải sản", "Quán cafe ven hồ"],
  },

  // ─── The Sapphire 2 (S2.01 – S2.19) ─────────────────────────
  "S2.01": {
    vinUni: { name: "Đại học VinUni", distanceM: 700, walkMin: 8, bikeMin: 3 },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 350, walkMin: 4, bikeMin: 1, note: "Chỉ 4 phút đi bộ tới sảnh tháp văn phòng" },
    vinBusStation: { name: "Trạm sảnh S2.01", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02", "E01"] },
    parking: { motorbike: "Hầm tòa nhà S2.01", car: "Nhà để xe nổi 5 tầng Sapphire 2 (ngay cạnh)" },
    nearbyLandmarks: ["Tháp TechnoPark", "Nhà để xe nổi 5 tầng S2", "Vincom Mega Mall (450m)"],
    groundPerks: ["Circle K 24/7", "WinMart+", "Cơm niêu Singapore", "Aha Coffee"],
  },
  "S2.02": {
    vinUni: { name: "Đại học VinUni", distanceM: 680, walkMin: 7, bikeMin: 2 },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 300, walkMin: 3, bikeMin: 1, note: "Sát tháp TechnoPark, đi bộ 3 phút" },
    vinBusStation: { name: "Trạm sảnh S2.02", distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà", car: "Nhà để xe nổi S2 kế bên" },
    nearbyLandmarks: ["Tháp TechnoPark", "Nhà để xe nổi S2", "Bể bơi bốn mùa"],
    groundPerks: ["WinMart+", "Highlands Coffee", "Nhà thuốc Pharmacity"],
  },
  "S2.03": {
    vinUni: { name: "Đại học VinUni", distanceM: 650, walkMin: 7, bikeMin: 2 },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 250, walkMin: 3, bikeMin: 1, note: "Tòa gần TechnoPark nhất, chỉ 250m" },
    vinBusStation: { name: "Trạm sảnh S2.03", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà", car: "Nhà để xe nổi S2 (kế bên)" },
    nearbyLandmarks: ["Tháp TechnoPark", "Nhà để xe nổi S2", "Cụm sân tennis"],
    groundPerks: ["Circle K 24/7", "Cơm tấm Cali", "Quán trà sữa"],
  },
  "S2.05": {
    vinUni: { name: "Đại học VinUni", distanceM: 600, walkMin: 6, bikeMin: 2 },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 280, walkMin: 3, bikeMin: 1, note: "Đi bộ 3 phút tới văn phòng TechnoPark" },
    vinBusStation: { name: "Trạm ngã ba S2.05", distanceM: 40, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S2.05", car: "Nhà để xe nổi S2" },
    nearbyLandmarks: ["Tháp TechnoPark", "Vincom Mega Mall (400m)", "Hồ San Hô"],
    groundPerks: ["WinMart+", "KFC / Lotteria", "Cafe Highlands"],
  },
  "S2.12": {
    vinUni: { name: "Đại học VinUni", distanceM: 450, walkMin: 5, bikeMin: 2, note: "Chỉ 5 phút đi bộ qua đường tới cổng trường VinUni" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 550, walkMin: 6, bikeMin: 2 },
    vinBusStation: { name: "Trạm sảnh S2.12", distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S2.12", car: "Nhà để xe nổi S2" },
    nearbyLandmarks: ["Đại học VinUni (đối diện)", "Trục đại lộ Hải Đăng", "Hồ San Hô"],
    groundPerks: ["Circle K", "WinMart+", "Cafe sinh viên", "Quán photocopy in ấn"],
  },
  "S2.15": {
    vinUni: { name: "Đại học VinUni", distanceM: 400, walkMin: 4, bikeMin: 1, note: "Tòa sát cổng chính VinUni nhất phân khu, chỉ 4 phút đi bộ" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 600, walkMin: 7, bikeMin: 2 },
    vinBusStation: { name: "Trạm sảnh S2.15", distanceM: 25, walkMin: 1, routes: ["OCP01", "OCP02", "E01"] },
    parking: { motorbike: "Hầm tòa S2.15", car: "Nhà để xe nổi S2" },
    nearbyLandmarks: ["Đại học VinUni (sát bên)", "Cổng trường VinUni", "Sân thể thao"],
    groundPerks: ["WinMart+", "Cafe The Alley", "Nhà thuốc", "Quán bún phở"],
  },
  "S2.16": {
    vinUni: { name: "Đại học VinUni", distanceM: 420, walkMin: 5, bikeMin: 1, note: "Sát trường VinUni, đi bộ 5 phút" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 620, walkMin: 7, bikeMin: 2 },
    vinBusStation: { name: "Trạm sảnh S2.16", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S2.16", car: "Nhà để xe nổi S2" },
    nearbyLandmarks: ["Đại học VinUni", "Đường Hải Đăng", "Bờ kênh sinh thái"],
    groundPerks: ["Circle K", "WinMart+", "Cafe học nhóm"],
  },
  "S2.17": {
    vinUni: { name: "Đại học VinUni", distanceM: 450, walkMin: 5, bikeMin: 2, note: "Đi bộ 5 phút tới cổng trường VinUni" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 650, walkMin: 7, bikeMin: 2 },
    vinBusStation: { name: "Trạm sảnh S2.17", distanceM: 25, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm tòa nhà S2.17", car: "Nhà để xe nổi S2" },
    nearbyLandmarks: ["Đại học VinUni", "Vườn nướng BBQ", "Sân thể thao ngoài trời"],
    groundPerks: ["WinMart+", "Tiệm giặt sấy", "Quán trà sữa"],
  },

  // ─── The Zenpark (R1.01 – R1.05) ────────────────────────────
  "R1.01": {
    vinUni: { name: "Đại học VinUni", distanceM: 1200, walkMin: 14, bikeMin: 4, busInfo: "VinBus OCP02 đón tại sảnh (3 phút)" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1400, walkMin: 16, bikeMin: 5 },
    vinBusStation: { name: "Trạm sảnh R1.01", distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm riêng chuẩn Ruby tòa R1.01", car: "Hầm đỗ ô tô liên thông nội khu Zenpark" },
    nearbyLandmarks: ["Vườn Nhật Bản nội khu", "Bể bơi bốn mùa kính mái vòm", "Sảnh lễ tân Ruby 24/7"],
    groundPerks: ["Lễ tân & sảnh đón 24/7", "Phòng gym nội khu miễn phí", "WinMart+", "Cafe Nhật Bản"],
  },
  "R1.02": {
    vinUni: { name: "Đại học VinUni", distanceM: 1250, walkMin: 15, bikeMin: 4, busInfo: "VinBus OCP02 đón sảnh (3 phút)" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1450, walkMin: 17, bikeMin: 5 },
    vinBusStation: { name: "Trạm sảnh R1.02", distanceM: 25, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm riêng tòa R1.02", car: "Hầm đỗ ô tô liên thông Zenpark" },
    nearbyLandmarks: ["Vườn Nhật Bản", "Hồ cá Koi", "Cụm sân chơi trẻ em chuẩn quốc tế"],
    groundPerks: ["Sảnh lounge Ruby", "Phòng gym & yoga nội khu", "Circle K", "Highlands Coffee"],
  },

  // ─── The Pavilion (P1 – P4) ─────────────────────────────────
  "P1": {
    vinUni: { name: "Đại học VinUni", distanceM: 1100, walkMin: 13, bikeMin: 4, busInfo: "VinBus OCP01 sảnh đón (3 phút)" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1300, walkMin: 15, bikeMin: 5 },
    vinBusStation: { name: "Trạm sảnh P1 Pavilion", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "2 tầng hầm gửi xe liên thông", car: "2 tầng hầm ô tô đảm bảo chỗ đỗ" },
    nearbyLandmarks: ["Vườn thực vật Botanic Garden", "Đảo tập Yoga", "Quảng trường The Ocean View"],
    groundPerks: ["WinMart+", "Nhà thuốc", "Quán cafe phong cách nhiệt đới"],
  },

  // ─── Masteri Waterfront (M1 – M3) ───────────────────────────
  "M1": {
    vinUni: { name: "Đại học VinUni", distanceM: 650, walkMin: 7, bikeMin: 2, note: "Chỉ 7 phút đi bộ ngắm hồ nước mặn tới VinUni" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 900, walkMin: 10, bikeMin: 3 },
    vinBusStation: { name: "Trạm sảnh Masteri M1", distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02", "E01"] },
    parking: { motorbike: "Hầm để xe chuẩn Masterise", car: "Hầm ô tô hiện đại kèm hệ thống thẻ thông minh" },
    nearbyLandmarks: ["Biển hồ nước mặn 6,1ha trực diện", "Bể bơi vô cực tầng thượng", "Lounge tiếp khách sang trọng"],
    groundPerks: ["Lễ tân quốc tế 24/7", "Business Lounge làm việc", "Starbucks Coffee", "Siêu thị cao cấp"],
  },

  // ─── The Zurich (ZR1 – ZR3) ─────────────────────────────────
  "ZR1": {
    vinUni: { name: "Đại học VinUni", distanceM: 1100, walkMin: 13, bikeMin: 4, busInfo: "VinBus OCP02 đón tại sảnh (3 phút)" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1300, walkMin: 15, bikeMin: 4 },
    vinBusStation: { name: "Trạm sảnh ZR1 The Zurich", distanceM: 25, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm thông minh The Zurich", car: "Hầm ô tô cao cấp kèm nhà để xe nổi kế bên" },
    nearbyLandmarks: ["Hồ San Hô (kế bên 100m)", "Vincom Mega Mall (850m)", "Biển hồ nước mặn & Hồ Ngọc Trai (1.2km)"],
    groundPerks: ["Sảnh đón sang trọng chuẩn Zurich", "Phòng gym & yoga nội khu", "Thermal Bath & xông hơi", "WinMart+", "Highlands Coffee"],
  },
  "ZR2": {
    vinUni: { name: "Đại học VinUni", distanceM: 1150, walkMin: 14, bikeMin: 4, busInfo: "VinBus OCP02 đón tại sảnh" },
    technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1350, walkMin: 15, bikeMin: 4 },
    vinBusStation: { name: "Trạm sảnh ZR2 The Zurich", distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
    parking: { motorbike: "Hầm đỗ xe thông minh", car: "Hầm ô tô Zurich & nhà xe nổi" },
    nearbyLandmarks: ["Hồ San Hô", "Vincom Mega Mall", "Biển hồ Crystal Lagoon"],
    groundPerks: ["Sảnh lounge chuẩn Thuỵ Sĩ", "Khu vui chơi trẻ em", "Circle K", "Cafe"],
  },
};

/**
 * Fallback dữ liệu kết nối theo Phân khu nếu tòa nhà chưa có trong bảng chi tiết.
 */
function getZoneFallbackCommute(zoneId: ZoneId, building: string): BuildingKnowledge {
  switch (zoneId) {
    case "sapphire2":
      return {
        building,
        zoneId,
        vinUni: { name: "Đại học VinUni", distanceM: 550, walkMin: 6, bikeMin: 2, busInfo: "VinBus đón tại sảnh", note: "Chỉ 5-7 phút đi bộ tới cổng trường" },
        technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 400, walkMin: 5, bikeMin: 2, note: "3-5 phút đi bộ tới sảnh văn phòng" },
        vinBusStation: { name: `Trạm sảnh ${building}`, distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02", "E01"] },
        parking: { motorbike: `Hầm tòa nhà ${building}`, car: "Nhà để xe nổi 5 tầng Sapphire 2" },
        nearbyLandmarks: ["Tháp TechnoPark", "Đại học VinUni", "Vincom Mega Mall"],
        groundPerks: ["WinMart+", "Circle K", "Quán cafe & ăn sáng chân tòa"],
      };
    case "zenpark":
      return {
        building,
        zoneId,
        vinUni: { name: "Đại học VinUni", distanceM: 1200, walkMin: 14, bikeMin: 4, busInfo: "VinBus OCP02 đưa đón tận cổng" },
        technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1400, walkMin: 16, bikeMin: 5 },
        vinBusStation: { name: `Trạm sảnh ${building}`, distanceM: 25, walkMin: 1, routes: ["OCP01", "OCP02"] },
        parking: { motorbike: `Hầm tòa nhà ${building}`, car: "Hầm đỗ ô tô liên thông phân khu Zenpark" },
        nearbyLandmarks: ["Vườn Nhật Bản nội khu", "Bể bơi 4 mùa mái kính", "Sảnh lễ tân Ruby 24/7"],
        groundPerks: ["Sảnh đón lễ tân 24/7", "Phòng gym & yoga", "WinMart+", "Cafe"],
      };
    case "pavilion":
      return {
        building,
        zoneId,
        vinUni: { name: "Đại học VinUni", distanceM: 1100, walkMin: 13, bikeMin: 4, busInfo: "VinBus OCP01/02" },
        technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 1300, walkMin: 15, bikeMin: 5 },
        vinBusStation: { name: `Trạm sảnh ${building}`, distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02"] },
        parking: { motorbike: `2 tầng hầm gửi xe tòa ${building}`, car: "2 tầng hầm đỗ ô tô liên thông" },
        nearbyLandmarks: ["Vườn thực vật Botanic Garden", "Đảo tập Yoga", "The Ocean View"],
        groundPerks: ["WinMart+", "Nhà thuốc", "Quán cafe"],
      };
    case "masteri":
      return {
        building,
        zoneId,
        vinUni: { name: "Đại học VinUni", distanceM: 650, walkMin: 7, bikeMin: 2, note: "Chỉ 7 phút đi bộ ngắm cảnh ven hồ" },
        technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 900, walkMin: 10, bikeMin: 3 },
        vinBusStation: { name: `Trạm sảnh ${building}`, distanceM: 20, walkMin: 1, routes: ["OCP01", "OCP02"] },
        parking: { motorbike: `Hầm gửi xe tòa ${building}`, car: "Hầm đỗ ô tô thông minh phân khu Masteri" },
        nearbyLandmarks: ["Biển hồ nước mặn 6,1ha", "Bể bơi panorama tầng thượng", "Lounge tiếp khách"],
        groundPerks: ["Lễ tân quốc tế 24/7", "Business lounge", "Starbucks", "Cửa hàng tiện lợi"],
      };
    case "sapphire1":
    default:
      return {
        building,
        zoneId,
        vinUni: { name: "Đại học VinUni", distanceM: 850, walkMin: 9, bikeMin: 3, busInfo: "VinBus OCP01 đón sảnh", note: "3-4 phút đạp xe hoặc xe bus điện miễn phí" },
        technoPark: { name: "Tháp văn phòng TechnoPark", distanceM: 950, walkMin: 11, bikeMin: 4 },
        vinBusStation: { name: `Trạm sảnh ${building}`, distanceM: 30, walkMin: 1, routes: ["OCP01", "OCP02", "E01"] },
        parking: { motorbike: `Hầm tòa nhà ${building}`, car: "Nhà để xe nổi 5 tầng Sapphire 1" },
        nearbyLandmarks: ["Trường liên cấp Vinschool", "Hồ điều hòa San Hô", "Công viên gym"],
        groundPerks: ["WinMart+", "Circle K 24/7", "Nhà thuốc", "Cafe học tập"],
      };
  }
}

/**
 * Lấy đầy đủ thông tin vị trí thực tế của một tòa nhà cụ thể.
 */
export function getBuildingKnowledge(building: string, zoneId: ZoneId): BuildingKnowledge {
  const specific = BUILDING_GEO_REGISTRY[building];
  const fallback = getZoneFallbackCommute(zoneId, building);

  return {
    building,
    zoneId,
    vinUni: specific?.vinUni || fallback.vinUni,
    technoPark: specific?.technoPark || fallback.technoPark,
    vinBusStation: specific?.vinBusStation || fallback.vinBusStation,
    parking: specific?.parking || fallback.parking,
    groundPerks: specific?.groundPerks || fallback.groundPerks,
    nearbyLandmarks: specific?.nearbyLandmarks || fallback.nearbyLandmarks,
  };
}

/**
 * Bộ máy phân tích thông minh toàn diện về trải nghiệm sống của căn hộ.
 * Kết hợp thông số thật của căn + vị trí thật của tòa + ngữ cảnh tìm kiếm của khách.
 */
export function getUnitLivingInsights(unit: Unit, criteria?: CriteriaState): UnitLivingInsights {
  const geo = getBuildingKnowledge(unit.building, unit.zoneId);

  // 1. Phân tích Layout (đặc biệt không gian +1)
  const isPlusOne = unit.layoutLabel.includes("+");
  let layoutInsight: UnitLivingInsights["layoutInsight"];

  if (unit.layout === "Studio") {
    layoutInsight = {
      badge: "Không gian mở All-in-one",
      title: "Căn hộ Studio tối ưu công năng & chi phí",
      description: "Không gian mở liên hoàn giữa phòng ngủ, khu bếp và ban công thoáng. Dễ dàng bài trí, tiết kiệm chi phí điện điều hòa và cực kỳ ấm cúng cho 1 người ở hoặc sinh viên học tập.",
    };
  } else if (unit.layout === "1PN") {
    if (isPlusOne) {
      layoutInsight = {
        badge: "Góc +1 đa năng đắt giá",
        title: "Thiết kế 1PN+ với không gian học tập & làm việc biệt lập",
        description: "Khoảng không gian cộng (+1) đa năng vuông vắn cạnh cửa sổ, cực kỳ lý tưởng để setup bàn học lớn, giá sách nghiên cứu cho sinh viên/giảng viên VinUni, hoặc làm góc làm việc WFH riêng tư tách biệt với phòng ngủ chính.",
        plusOneHighlight: "Đủ diện tích kê bàn làm việc 1m4 + kệ sách + ghế công thái học hoặc giường đơn 1m2 dự phòng",
      };
    } else {
      layoutInsight = {
        badge: "Phòng ngủ khép kín riêng tư",
        title: "Căn hộ 1 phòng ngủ tiêu chuẩn",
        description: "Phòng ngủ lớn có cửa đóng riêng biệt, cách ly hoàn toàn với khu vực bếp và phòng khách. Đảm bảo giấc ngủ sâu và không gian sinh hoạt độc lập.",
      };
    }
  } else if (unit.layout === "2PN") {
    layoutInsight = {
      badge: isPlusOne ? "2PN+1 siêu rộng" : "2PN gia đình",
      title: isPlusOne ? "Căn hộ 2PN+1 với không gian sinh hoạt phụ" : "Căn hộ 2 phòng ngủ thông thoáng",
      description: isPlusOne
        ? "Bao gồm 2 phòng ngủ riêng biệt cùng không gian +1 rộng rãi có thể làm phòng đọc sách, góc chơi trẻ em hoặc phòng làm việc chung."
        : "Thiết kế 2 phòng ngủ tách đôi tối ưu riêng tư, phòng khách nối liền ban công đón ánh sáng tự nhiên. Rất phù hợp cho 2 sinh viên ở ghép hoặc gia đình trẻ.",
      plusOneHighlight: isPlusOne ? "Góc +1 thoải mái kê bàn làm việc đôi hoặc sofa bed" : undefined,
    };
  } else {
    layoutInsight = {
      badge: "3 Phòng ngủ rộng rãi",
      title: "Căn hộ 3 phòng ngủ tiện nghi",
      description: "Diện tích lớn, các phòng ngủ đều có cửa sổ đón sáng. Không gian sinh hoạt chung rộng rãi phù hợp gia đình đa thế hệ hoặc nhóm bạn cùng thuê chia sẻ chi phí.",
    };
  }

  // 2. Phân tích Tầng cao
  let floorInsight: UnitLivingInsights["floorInsight"];
  if (unit.floor >= 20) {
    floorInsight = {
      level: "high",
      title: `Tầng ${unit.floor} cao thoáng & cực kỳ tĩnh lặng`,
      description: "Độ cao lý tưởng giúp triệt tiêu hoàn toàn tiếng ồn xe cộ từ đường nội khu và loại bỏ hoàn toàn muỗi hay côn trùng. Gió tự nhiên lưu thông mát mẻ, không khí trong lành tối ưu cho sự tập trung học tập và nghỉ ngơi.",
    };
  } else if (unit.floor >= 8) {
    floorInsight = {
      level: "mid",
      title: `Tầng ${unit.floor} độ cao vàng, cân bằng gió và ánh sáng`,
      description: "Tầm nhìn bao quát cảnh quan nội khu xanh mát, đón ánh sáng chan hòa và thời gian di chuyển thang máy nhanh chóng.",
    };
  } else {
    floorInsight = {
      level: "low",
      title: `Tầng ${unit.floor} tiện lợi, di chuyển nhanh chóng`,
      description: "Cực kỳ thuận tiện khi cần di chuyển nhanh chóng, có thể dùng thang bộ vào giờ cao điểm. Tầm nhìn gần gũi với công viên cây xanh và vườn hoa nội khu.",
    };
  }

  // 3. Phân tích Hướng ban công
  let directionInsight: UnitLivingInsights["directionInsight"];
  const dir = unit.direction.toLowerCase();
  if (dir.includes("đông nam") || dir.includes("nam")) {
    directionInsight = {
      direction: unit.direction,
      title: `Ban công hướng ${unit.direction} đón gió mát tự nhiên`,
      description: "Hướng vàng trong phong thủy nhà ở Việt Nam: đón trọn luồng gió mát mẻ quanh năm, mùa hè lộng gió mát rượi, mùa đông ấm áp và hoàn toàn tránh được nắng gắt trực diện buổi chiều.",
    };
  } else if (dir.includes("đông") || dir.includes("đông bắc")) {
    directionInsight = {
      direction: unit.direction,
      title: `Ban công hướng ${unit.direction} đón nắng sớm trong lành`,
      description: "Đón ánh nắng ban mai nhẹ nhàng giúp căn nhà luôn khô ráo và tràn ngập sinh khí; buổi chiều hoàn toàn râm mát dễ chịu.",
    };
  } else {
    directionInsight = {
      direction: unit.direction,
      title: `Ban công hướng ${unit.direction} với tầm nhìn hoàng hôn rực rỡ`,
      description: "Tầm nhìn khoáng đạt chiêm ngưỡng trọn vẹn hoàng hôn chiều tà, căn hộ đã trang bị sẵn hệ thống rèm cản nhiệt cao cấp đảm bảo nhiệt độ luôn dịu mát.",
    };
  }

  // 4. Đối tượng phù hợp nhất (Best Match)
  const bestFor: string[] = [];
  if (geo.vinUni.distanceM <= 900) {
    bestFor.push("Sinh viên & Giảng viên Đại học VinUni (chỉ 3–8 phút di chuyển)");
  }
  if (geo.technoPark.distanceM <= 900) {
    bestFor.push("Chuyên viên, kỹ sư làm việc tại tháp TechnoPark (đi bộ hoặc 3-5 phút xe)");
  }
  if (isPlusOne) {
    bestFor.push("Người làm việc từ xa (WFH) / Freelancer cần không gian học tập, làm việc riêng");
  }
  if (unit.layout === "Studio" || unit.layout === "1PN") {
    bestFor.push("Cá nhân độc thân, chuyên gia nước ngoài hoặc cặp đôi trẻ bắt đầu cuộc sống tự lập");
  } else {
    bestFor.push("Gia đình trẻ hoặc nhóm bạn cùng thuê chia sẻ chi phí sinh hoạt");
  }

  // 5. Ngữ cảnh tương thích tìm kiếm (Context Match)
  let contextMatch: UnitLivingInsights["contextMatch"];
  const nearQuery = criteria?.nearLocation?.toLowerCase() || "";
  
  if (nearQuery.includes("vinuni") || nearQuery.includes("đại học") || nearQuery.includes("trường") || geo.vinUni.distanceM <= 900) {
    contextMatch = {
      matchedTarget: "Đại học VinUni",
      headline: `Tối ưu cho mục tiêu gần Đại học VinUni (~${geo.vinUni.distanceM}m)`,
      summary: `Từ sảnh ${unit.building}, chỉ mất ${geo.vinUni.bikeMin} phút đạp xe hoặc ${geo.vinUni.walkMin} phút đi bộ. Xe buýt điện VinBus OCP01/02 đón ngay chân sảnh đưa đón thẳng tới cổng trường miễn phí.`,
    };
  } else if (nearQuery.includes("techno") || nearQuery.includes("văn phòng") || geo.technoPark.distanceM <= 600) {
    contextMatch = {
      matchedTarget: "Tháp TechnoPark",
      headline: `Vị trí siêu tiện lợi tới Tháp TechnoPark (~${geo.technoPark.distanceM}m)`,
      summary: `Tòa ${unit.building} chỉ cách tháp văn phòng TechnoPark ${geo.technoPark.walkMin || 5} phút di chuyển, rất phù hợp cho nhân sự công nghệ và văn phòng.`,
    };
  }

  return {
    commute: {
      vinUni: geo.vinUni,
      technoPark: geo.technoPark,
      vinBus: geo.vinBusStation,
      parking: geo.parking,
      groundPerks: geo.groundPerks,
      nearbyLandmarks: geo.nearbyLandmarks,
    },
    layoutInsight,
    floorInsight,
    directionInsight,
    bestFor,
    contextMatch,
  };
}

/**
 * Lấy danh mục tiện ích thực tế chính xác 100% của từng tòa nhà / phân khu
 */
export function getBuildingPerks(building: string, zoneId: ZoneId): string[] {
  switch (zoneId) {
    case "zenpark":
      return [
        "Sảnh lễ tân đón tiếp 24/7",
        "Thang máy quẹt thẻ phân tầng",
        "Vườn Nhật Bản & Hồ cá Koi nội khu",
        "Bể bơi 4 mùa kính mái vòm",
        "Phòng gym & yoga miễn phí trong tòa",
        "Hầm gửi xe liên thông chuẩn Ruby",
      ];
    case "masteri":
      return [
        "Sảnh lounge lễ tân quốc tế 24/7",
        "Bể bơi vô cực tầng thượng ngắm hồ",
        "Khu Business Lounge làm việc cao cấp",
        "Biển hồ nước mặn 6,1 ha trực diện",
        "Hầm để xe thông minh nhận diện biển số",
        "Thang máy tốc độ cao Schindler",
      ];
    case "pavilion":
      return [
        "2 tầng hầm gửi xe liên thông (đảm bảo chỗ đỗ)",
        "Đảo tập Yoga & Vườn thực vật Botanic",
        "Thang máy quẹt thẻ an ninh",
        "Bảo vệ & camera giám sát 24/7",
        "Sân chơi trẻ em The Ocean View",
        "Chuỗi shophouse ẩm thực chân tòa",
      ];
    case "sapphire1":
    case "sapphire2":
    default:
      return [
        "Bảo vệ & kiểm soát an ninh 24/7",
        "Thang máy quẹt thẻ cư dân",
        "Hầm gửi xe máy tòa nhà",
        "Nhà để xe nổi 5 tầng kế bên",
        "Bể bơi ngoài trời & cụm sân thể thao",
        "Siêu thị WinMart+ & Circle K chân sảnh",
      ];
  }
}
