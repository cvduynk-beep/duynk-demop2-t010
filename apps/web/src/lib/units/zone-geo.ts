import type { ZoneId } from "@/lib/units";

/**
 * Địa danh lân cận từng phân khu Ocean Park 1 (nội dung tham chiếu tĩnh, minh hoạ trên sơ đồ — không phải dữ liệu
 * nghiệp vụ). Số căn, tòa, Host phụ trách luôn lấy từ API.
 */
export const ZONE_NEARBY: Record<ZoneId, { label: string; walk: string }[]> = {
  sapphire1: [{ label: "Biển hồ Ocean Park", walk: "3 phút đi bộ" }, { label: "Vincom Mega Mall", walk: "6 phút đi bộ" }, { label: "Trường Vinschool", walk: "8 phút đi bộ" }, { label: "Đại học VinUni", walk: "12 phút đi bộ" }],
  sapphire2: [{ label: "Biển hồ Ocean Park", walk: "5 phút đi bộ" }, { label: "Vincom Mega Mall", walk: "4 phút đi bộ" }, { label: "Đại học VinUni", walk: "9 phút đi bộ" }, { label: "Phố đi bộ Malibu", walk: "7 phút đi bộ" }],
  zenpark: [{ label: "Công viên Nhật Bản", walk: "2 phút đi bộ" }, { label: "Biển hồ Ocean Park", walk: "10 phút đi bộ" }, { label: "Trạm VinBus", walk: "3 phút đi bộ" }, { label: "Đại học VinUni", walk: "6 phút đạp xe" }],
  pavilion: [{ label: "Biển hồ Ocean Park", walk: "6 phút đi bộ" }, { label: "Trung tâm thương mại", walk: "8 phút đi bộ" }, { label: "Bệnh viện Vinmec", walk: "10 phút đạp xe" }, { label: "Đại học VinUni", walk: "10 phút đạp xe" }],
  masteri: [{ label: "Bến du thuyền", walk: "4 phút đi bộ" }, { label: "Vincom Mega Mall", walk: "9 phút đi bộ" }, { label: "Phố đi bộ ven hồ", walk: "2 phút đi bộ" }, { label: "Đại học VinUni", walk: "8 phút đạp xe" }],
};
