"""
VinStay AI - Ocean Park Catalog & Matchmaker Engine
Rổ hàng + xếp hạng lấy NGUYÊN từ Core API (`POST /matchmaker/recommend` của backend NestJS, dữ liệu DB thật).
Agent không giữ danh sách căn riêng và không tự xếp lại thứ tự: lọc cứng ngân sách All-in do backend thực thi.
"""

from typing import Any

from src.services.core_api import recommend

# Enum layout của intent parser → tham số matchmaker. 2PN gồm cả 2PN1WC và 2PN2WC nên đi theo nhóm `layouts`.
_LAYOUT_PARAM: dict[str, dict[str, Any]] = {
    "STUDIO": {"layouts": ["Studio"]},
    "ONE_BED_PLUS": {"layouts": ["1PN"]},
    "TWO_BED_ONE_BATH": {"preferredLayout": "TWO_BED_ONE_BATH"},
    "TWO_BED_TWO_BATH": {"layouts": ["2PN"]},
    "THREE_BED": {"layouts": ["3PN"]},
}
_ZONE_PARAM = {
    "sapphire 1": "sapphire1",
    "sapphire 2": "sapphire2",
    "zenpark": "zenpark",
    "pavilion": "pavilion",
    "masteri": "masteri",
}
BUDGET_MIN = 3_000_000


def _request_body(
    budget_ceiling: float | None,
    layout_type: str | None,
    zone: str | None,
    motorbikes: int,
    cars: int,
    occupants: int,
    top_k: int,
) -> dict[str, Any]:
    body: dict[str, Any] = {"motorbikes": motorbikes, "cars": cars, "occupants": occupants, "limit": top_k}
    if budget_ceiling:
        body["maxAllInBudget"] = int(budget_ceiling)
    if layout_type and layout_type.upper() in _LAYOUT_PARAM:
        body.update(_LAYOUT_PARAM[layout_type.upper()])
    if zone:
        key = zone.lower().replace("the ", "").strip()
        if key in _ZONE_PARAM:
            body["zones"] = [_ZONE_PARAM[key]]
    return body


def _to_matched(r: dict[str, Any]) -> dict[str, Any]:
    cost = r.get("allInCost") or {}
    cmp = r.get("comparison") or {}
    saving = int(cmp.get("savingPercentage") or 0)
    is_bargain = bool(cmp.get("isBargain"))
    return {
        "rank": r.get("rank"),
        "unit_code": r.get("unitCode"),
        "building_code": r.get("buildingCode"),
        "zone_name": r.get("zoneName") or "",
        "floor_number": r.get("floor"),
        "layout_type": r.get("layoutType"),
        "carpet_area_m2": r.get("carpetAreaM2"),
        "base_rent_price": cost.get("baseRent"),
        "all_in_total": cost.get("allInTotal"),
        "management_fee": cost.get("managementFee"),
        "parking_fee": cost.get("parkingFee"),
        "utility_cost": cost.get("utilityCost"),
        "saving_percentage": saving,
        "is_bargain": is_bargain,
        "badge_text": f"🔥 CĂN HỜI PHÂN KHU (-{saving}%)" if is_bargain else None,
        "verified_label": "VERIFIED 100% THỰC TẾ",
        "highlights": [],
    }


def match_units_by_all_in(
    budget_ceiling: float | None = None,
    layout_type: str | None = None,
    zone: str | None = None,
    motorbikes: int = 1,
    cars: int = 0,
    occupants: int = 2,
    top_k: int = 3,
) -> list[dict[str, Any]]:
    """Top căn theo đúng thứ tự matchmaker trả. Lỗi Core API ⇒ `CoreApiError` (caller không được tự dựng danh sách)."""
    if budget_ceiling and budget_ceiling < BUDGET_MIN:
        # Backend từ chối ngân sách < 3 triệu; không nới trần hộ khách ⇒ không có căn nào khớp.
        return []
    data = recommend(_request_body(budget_ceiling, layout_type, zone, motorbikes, cars, occupants, top_k))
    return [_to_matched(r) for r in data["topRecommendations"]]
