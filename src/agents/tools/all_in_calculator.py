"""
VinStay AI - All-in Cost Calculator Tool
Tính toán minh bạch trọn gói 4 khoản chi phí sinh hoạt tại Vinhomes Ocean Park:
1. Tiền thuê gốc (Base Rent)
2. Phí quản lý BQL Vinhomes (9.500đ/m2 thông thủy)
3. Phí gửi xe (150.000đ/xe máy, 1.250.000đ/ô tô)
4. Dự toán điện nước EVN (300.000đ/người/tháng)
Và tính toán Badge "Căn hời phân khu" (tiết kiệm >= 10% so với giá thị trường).
"""

from typing import Any


def calculate_all_in_cost(
    base_rent: float,
    carpet_area_m2: float,
    market_avg_price: float = 0,
    motorbikes: int = 1,
    cars: int = 0,
    occupants: int = 2,
) -> dict[str, Any]:
    mgmt_fee = round(carpet_area_m2 * 9500)
    parking_fee = motorbikes * 150000 + cars * 1250000
    utility_cost = occupants * 300000
    all_in_total = base_rent + mgmt_fee + parking_fee + utility_cost

    # So sánh với giá thị trường cùng layout
    market_all_in = (market_avg_price or base_rent * 1.1) + mgmt_fee + parking_fee + utility_cost
    saving_amount = max(0.0, market_all_in - all_in_total)
    saving_percentage = round((saving_amount / market_all_in) * 100) if market_all_in > 0 else 0
    is_bargain = saving_percentage >= 10

    badge_text = f"🔥 CĂN HỜI PHÂN KHU (-{saving_percentage}%)" if is_bargain else None

    return {
        "base_rent": base_rent,
        "carpet_area_m2": carpet_area_m2,
        "management_fee": mgmt_fee,
        "parking_fee": parking_fee,
        "utility_cost": utility_cost,
        "all_in_total": all_in_total,
        "market_avg_price": market_avg_price,
        "market_all_in": market_all_in,
        "saving_amount": saving_amount,
        "saving_percentage": saving_percentage,
        "is_bargain": is_bargain,
        "badge_text": badge_text,
    }
