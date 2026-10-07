"""
VinStay AI - Intent & Criteria Parser Node
Phân tích câu truy vấn của người dùng để trích xuất Intent và các thực thể:
- Ngân sách trần All-in (ví dụ: "dưới 8.5 triệu", "8.500.000 đ", "8tr5", "khoảng 7 củ")
- Layout type: STUDIO, ONE_BED_PLUS, TWO_BED_TWO_BATH, THREE_BED
- Zone: The Sapphire 1, The Sapphire 2
- Số người ở, số xe máy, ô tô
"""

import re
from typing import Any

from ..state import AgentState, SearchCriteria
from ..tools.policy_faq import lookup_policy


def extract_budget(text: str) -> float | None:
    t = text.lower()

    # 1. Dạng viết hoa/thường có dấu chấm/phẩy đầy đủ: "8.500.000", "8,500,000", "8500000" kèm đ/vnd/đồng
    m_full = re.search(r"(\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|vnd|vnđ|đồng))?)", t)
    if m_full:
        num_str = re.sub(r"[^\d]", "", m_full.group(1))
        if num_str:
            val = float(num_str)
            if val >= 1_000_000:
                return val

    # 2. Dạng kết hợp: "8tr5", "8củ5" -> 8.5 triệu
    m_half = re.search(r"(\d+)\s*(?:tr|củ)\s*(\d+)", t)
    if m_half:
        v1 = float(m_half.group(1))
        v2 = float(m_half.group(2))
        return (v1 + v2 / 10.0) * 1_000_000

    # 3. Dạng số thập phân: "8.5 triệu", "8,5 tr", "7 củ", "8m", "8.5tr"
    m_unit = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:triệu|tr|củ|m|vnd|vnđ|k|đ|đồng)", t)
    if m_unit:
        val_str = m_unit.group(1).replace(",", ".")
        val = float(val_str)
        if val < 50:  # Đơn vị triệu
            return val * 1_000_000
        elif val < 100_000:  # Đơn vị nghìn (8500k)
            return val * 1_000
        else:
            return val

    # 4. Dạng thuần số >= 1 triệu: "dưới 8500000"
    m_num = re.search(r"\b(\d{7,8})\b", t)
    if m_num:
        return float(m_num.group(1))

    return None


def parse_intent_and_criteria_node(state: AgentState) -> dict[str, Any]:
    query = state.get("query", "").strip()
    q_lower = query.lower()
    existing_criteria = state.get("criteria", {}) or {}

    # 1. Kiểm tra nếu là câu hỏi chính sách / FAQ
    policy_hit = lookup_policy(query)
    if policy_hit and not any(k in q_lower for k in ["tìm", "thuê", "còn căn", "giới thiệu", "gợi ý", "dưới", "triệu"]):
        return {
            "intent": "policy_faq",
            "policy_answer": policy_hit,
        }

    # 2. Mặc định là tìm kiếm căn hộ (Matchmaker)
    criteria: SearchCriteria = {
        "occupants": existing_criteria.get("occupants", 2),
        "motorbikes": existing_criteria.get("motorbikes", 1),
        "cars": existing_criteria.get("cars", 0),
    }

    # Trích xuất ngân sách (Budget Ceiling)
    budget = existing_criteria.get("budget_ceiling") or extract_budget(query)
    criteria["budget_ceiling"] = budget

    # Trích xuất layout
    if any(k in q_lower for k in ["studio", "căn studio", "phòng đơn"]):
        criteria["layout_type"] = "STUDIO"
    elif any(k in q_lower for k in ["1pn+", "1pn +", "1 ngủ +", "1 phòng ngủ +", "one_bed_plus", "1pn1wc", "1pn"]):
        criteria["layout_type"] = "ONE_BED_PLUS"
    elif any(k in q_lower for k in ["2pn", "2 phòng ngủ", "2 ngủ", "two_bed"]):
        criteria["layout_type"] = "TWO_BED_TWO_BATH"
    elif any(k in q_lower for k in ["3pn", "3 phòng ngủ", "3 ngủ", "three_bed"]):
        criteria["layout_type"] = "THREE_BED"
    elif "layout_type" in existing_criteria:
        criteria["layout_type"] = existing_criteria["layout_type"]

    # Trích xuất phân khu (Zone / Building)
    if any(k in q_lower for k in ["sapphire 1", "s1", "s1."]):
        criteria["zone"] = "Sapphire 1"
    elif any(k in q_lower for k in ["sapphire 2", "s2", "s2."]):
        criteria["zone"] = "Sapphire 2"
    elif "zone" in existing_criteria:
        criteria["zone"] = existing_criteria["zone"]

    # Trích xuất số xe / người
    if "ô tô" in q_lower or "oto" in q_lower or "xe hơi" in q_lower:
        criteria["cars"] = 1
    if "1 xe máy" in q_lower:
        criteria["motorbikes"] = 1
    elif "2 xe máy" in q_lower:
        criteria["motorbikes"] = 2

    if "1 người" in q_lower:
        criteria["occupants"] = 1
    elif "3 người" in q_lower:
        criteria["occupants"] = 3
    elif "4 người" in q_lower:
        criteria["occupants"] = 4

    return {
        "intent": "search_unit",
        "criteria": criteria,
        "policy_answer": policy_hit,
    }
