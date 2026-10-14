"""
VinStay AI - Matchmaker Node
Gọi AI Matchmaker của backend (Core API): lọc cứng theo ngân sách All-in Cost trần + xếp hạng. Không tự xếp lại.
"""

from typing import Any

from src.services.core_api import CoreApiError

from ..state import AgentState
from ..tools.oceanpark_catalog import match_units_by_all_in


def matchmaker_node(state: AgentState) -> dict[str, Any]:
    criteria = state.get("criteria", {})
    budget_ceiling = criteria.get("budget_ceiling")
    layout_type = criteria.get("layout_type")
    zone = criteria.get("zone")
    motorbikes = criteria.get("motorbikes", 1)
    cars = criteria.get("cars", 0)
    occupants = criteria.get("occupants", 2)

    try:
        matched = match_units_by_all_in(
            budget_ceiling=budget_ceiling,
            layout_type=layout_type,
            zone=zone,
            motorbikes=motorbikes,
            cars=cars,
            occupants=occupants,
            top_k=3,
        )
    except CoreApiError as exc:
        # Không có danh sách thật ⇒ không có danh sách nào (cấm dựng căn thay thế).
        return {
            "matched_units": [],
            "analysis": "- Chưa gọi được AI Matchmaker (Core API).",
            "metadata": {"recommend_error": str(exc)},
        }

    analysis_lines = []
    if budget_ceiling:
        analysis_lines.append(f"- Đã áp dụng bộ lọc cứng ngân sách trần All-in: ≤ {budget_ceiling:,.0f} VNĐ.")
    if layout_type:
        analysis_lines.append(f"- Loại căn yêu cầu: {layout_type}.")
    if zone:
        analysis_lines.append(f"- Phân khu ưu tiên: {zone}.")
    analysis_lines.append(f"- Tìm thấy {len(matched)} căn hộ phù hợp (xếp hạng bởi AI Matchmaker).")

    return {
        "matched_units": matched,
        "analysis": "\n".join(analysis_lines),
    }
