"""
VinStay AI - Matchmaker Node
Thực thi thuật toán AI Matchmaker: Lọc cứng theo ngân sách All-in Cost trần trong 30 giây.
"""

from typing import Any

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

    matched = match_units_by_all_in(
        budget_ceiling=budget_ceiling,
        layout_type=layout_type,
        zone=zone,
        motorbikes=motorbikes,
        cars=cars,
        occupants=occupants,
        top_k=3,
    )

    analysis_lines = []
    if budget_ceiling:
        analysis_lines.append(f"- Đã áp dụng bộ lọc cứng ngân sách trần All-in: ≤ {budget_ceiling:,.0f} VNĐ.")
    if layout_type:
        analysis_lines.append(f"- Loại căn yêu cầu: {layout_type}.")
    if zone:
        analysis_lines.append(f"- Phân khu ưu tiên: {zone}.")
    analysis_lines.append(f"- Tìm thấy {len(matched)} căn hộ phù hợp đã kiểm định 100% hiện trường.")

    return {
        "matched_units": matched,
        "analysis": "\n".join(analysis_lines),
    }
