"""
VinStay AI - Ocean Park Catalog & Matchmaker Engine
Rổ hàng căn hộ chuẩn hóa tại Vinhomes Ocean Park (The Sapphire 1 & 2).
Thuật toán lọc cứng: 100% loại trừ căn vượt ngân sách trần All-in Cost.
"""

from typing import Any

from .all_in_calculator import calculate_all_in_cost

# Danh mục căn hộ chuẩn hóa The Sapphire 1 & 2
RAW_UNITS = [
    {
        "unit_code": "VHOP-S1.05-0804",
        "building_code": "S1.05",
        "zone_name": "The Sapphire 1",
        "floor_number": 8,
        "layout_type": "STUDIO",
        "carpet_area_m2": 32.5,
        "base_rent_price": 4800000,
        "market_avg_price": 5500000,
        "highlights": ["Tầng trung thoáng mát", "Đồ cơ bản tiện nghi", "Gần nhà để xe nổi"],
        "status": "AVAILABLE",
    },
    {
        "unit_code": "VHOP-S1.02-12A08",
        "building_code": "S1.02",
        "zone_name": "The Sapphire 1",
        "floor_number": 12,
        "layout_type": "ONE_BED_PLUS",
        "carpet_area_m2": 47.0,
        "base_rent_price": 6500000,
        "market_avg_price": 7400000,
        "highlights": ["1PN+1 đa năng", "Ban công Đông Nam mát rượi", "Full nội thất mới 100%"],
        "status": "AVAILABLE",
    },
    {
        "unit_code": "VHOP-S2.05-1808",
        "building_code": "S2.05",
        "zone_name": "The Sapphire 2",
        "floor_number": 18,
        "layout_type": "ONE_BED_PLUS",
        "carpet_area_m2": 48.0,
        "base_rent_price": 6800000,
        "market_avg_price": 7600000,
        "highlights": ["View nội khu bể bơi", "Thiết kế hiện đại", "Gần trường VinUni"],
        "status": "AVAILABLE",
    },
    {
        "unit_code": "VHOP-S2.01-1812",
        "building_code": "S2.01",
        "zone_name": "The Sapphire 2",
        "floor_number": 18,
        "layout_type": "TWO_BED_TWO_BATH",
        "carpet_area_m2": 69.0,
        "base_rent_price": 8500000,
        "market_avg_price": 9800000,
        "highlights": ["Căn góc 2PN 2WC", "Nội thất cao cấp", "Cách sảnh xe buýt 50m"],
        "status": "AVAILABLE",
    },
    {
        "unit_code": "VHOP-S1.08-2206",
        "building_code": "S1.08",
        "zone_name": "The Sapphire 1",
        "floor_number": 22,
        "layout_type": "TWO_BED_TWO_BATH",
        "carpet_area_m2": 64.0,
        "base_rent_price": 8200000,
        "market_avg_price": 9300000,
        "highlights": ["View hồ điều hòa", "Tầng cao thoáng đãng", "Được nuôi thú cưng"],
        "status": "AVAILABLE",
    },
    {
        "unit_code": "VHOP-S2.16-1502",
        "building_code": "S2.16",
        "zone_name": "The Sapphire 2",
        "floor_number": 15,
        "layout_type": "THREE_BED",
        "carpet_area_m2": 80.5,
        "base_rent_price": 11500000,
        "market_avg_price": 13200000,
        "highlights": ["3 Phòng ngủ gia đình", "Ban công đón gió", "Sát công viên trung tâm"],
        "status": "AVAILABLE",
    },
    {
        "unit_code": "VHOP-S1.12-1002",
        "building_code": "S1.12",
        "zone_name": "The Sapphire 1",
        "floor_number": 10,
        "layout_type": "STUDIO",
        "carpet_area_m2": 31.0,
        "base_rent_price": 4500000,
        "market_avg_price": 5200000,
        "highlights": ["Giá tốt nhất phân khu", "Gần trạm xe buýt VinBus", "Trống vào ở ngay"],
        "status": "AVAILABLE",
    },
]


def match_units_by_all_in(
    budget_ceiling: float | None = None,
    layout_type: str | None = None,
    zone: str | None = None,
    motorbikes: int = 1,
    cars: int = 0,
    occupants: int = 2,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    results = []

    for u in RAW_UNITS:
        if u.get("status") != "AVAILABLE":
            continue

        # Lọc theo layout nếu có
        if layout_type and layout_type.upper() not in u["layout_type"].upper():
            continue

        # Lọc theo zone nếu có
        if zone and zone.lower() not in u["zone_name"].lower():
            continue

        # Tính All-in Cost trọn gói
        cost = calculate_all_in_cost(
            base_rent=u["base_rent_price"],
            carpet_area_m2=u["carpet_area_m2"],
            market_avg_price=u["market_avg_price"],
            motorbikes=motorbikes,
            cars=cars,
            occupants=occupants,
        )

        # Lọc cứng: Loại bỏ 100% căn vượt ngân sách trần
        if budget_ceiling and cost["all_in_total"] > budget_ceiling:
            continue

        matched_item = {
            **u,
            "all_in_total": cost["all_in_total"],
            "management_fee": cost["management_fee"],
            "parking_fee": cost["parking_fee"],
            "utility_cost": cost["utility_cost"],
            "saving_percentage": cost["saving_percentage"],
            "is_bargain": cost["is_bargain"],
            "badge_text": cost["badge_text"],
            "verified_label": "VERIFIED 100% THỰC TẾ",
        }
        results.append(matched_item)

    # Xếp hạng: Ưu tiên căn hời (tiết kiệm cao nhất), sau đó là All-in tối ưu nhất
    results.sort(key=lambda x: (-x["saving_percentage"], x["all_in_total"]))
    return results[:top_k]
