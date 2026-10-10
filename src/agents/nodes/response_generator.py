"""
VinStay AI - Response Generator Node
Sinh câu trả lời tự nhiên, chuyên nghiệp, minh bạch 100% chi phí All-in Cost và hướng dẫn khách đặt lịch xem phòng.
"""

from typing import Any

from ..llm import generate_response_with_gemini
from ..state import AgentState


def response_generator_node(state: AgentState) -> dict[str, Any]:
    query = state.get("query", "")
    intent = state.get("intent", "search_unit")
    policy_answer = state.get("policy_answer")
    matched_units = state.get("matched_units", [])
    criteria = state.get("criteria", {})
    budget_ceiling = criteria.get("budget_ceiling")

    # Thử sinh câu trả lời bằng Gemini Flash nếu có
    if matched_units:
        gemini_reply = generate_response_with_gemini(matched_units, criteria, policy_answer, query)
        if gemini_reply:
            return {
                "response": gemini_reply,
                "metadata": {"llm_generator": "gemini-flash"},
            }

    # Trường hợp 1: Hỏi về quy chế BQL / Chính sách cọc
    if intent == "policy_faq" or (policy_answer and not matched_units):
        return {
            "response": policy_answer or "Dạ VinStay AI sẵn sàng giải đáp mọi thắc mắc về nội quy Vinhomes Ocean Park và biểu phí All-in trọn gói!",
        }

    # Trường hợp 2: Kết quả tìm kiếm căn hộ
    if matched_units:
        parts = []
        if policy_answer:
            parts.append(policy_answer + "\n\n---\n")

        header = "✨ **VinStay AI đã tìm thấy các căn hộ phù hợp nhất tại Vinhomes Ocean Park:**"
        if budget_ceiling:
            header += f"\n*(Cam kết All-in Cost trọn gói không vượt quá ngân sách trần **{budget_ceiling:,.0f} đ/tháng**)*\n"
        parts.append(header)

        for idx, u in enumerate(matched_units, start=1):
            badge = f" {u['badge_text']}" if u.get("badge_text") else ""
            card = (
                f"### {idx}. {u['unit_code']} ({u['zone_name']}) — Tầng {u['floor_number']}{badge}\n"
                f"- **Loại căn:** {u['layout_type']} · **Diện tích thông thủy:** {u['carpet_area_m2']} m²\n"
                f"- **Giá thuê gốc:** `{u['base_rent_price']:,.0f} đ/tháng`\n"
                f"- 📊 **TỔNG CHI PHÍ ALL-IN TRỌN GÓI: `{u['all_in_total']:,.0f} đ/tháng`**\n"
                f"  *(Đã gồm: Thuê gốc + Phí QL BQL {u['management_fee']:,.0f}đ + Gửi xe {u['parking_fee']:,.0f}đ + Điện nước ước tính {u['utility_cost']:,.0f}đ)*\n"
                f"- **Đặc điểm nổi bật:** {', '.join(u.get('highlights', []))}\n"
                f"- 🛡️ **Chứng nhận:** `{u.get('verified_label', 'VERIFIED 100% THỰC TẾ')}`\n"
            )
            parts.append(card)

        footer = (
            "\n💡 **Bước tiếp theo:** Bạn có thể bấm **'Đặt lịch xem phòng'** (Field Host đón tại sảnh bằng thẻ cư dân trong 60 giây) "
            "hoặc quét **VietQR giữ chỗ 2.000.000đ** để khóa căn độc quyền 48h (nguyên tắc *First-to-Pay Wins*)!"
        )
        parts.append(footer)
        return {"response": "\n".join(parts)}

    # Trường hợp 3: Không tìm thấy căn nào dưới ngân sách trần
    budget_str = f"{budget_ceiling:,.0f} đ" if budget_ceiling else "yêu cầu"
    no_match_msg = (
        f"Hiện tại không có căn hộ nào có tổng chi phí **All-in Cost** dưới mức {budget_str}.\n"
        "💡 *Lời khuyên từ AI Matchmaker:*\n"
        "- Bạn có thể thử nới rộng ngân sách thêm khoảng 500.000đ – 1.000.000đ.\n"
        "- Hoặc chuyển sang loại căn Studio / căn chưa đồ để có mức giá tốt nhất phân khu!"
    )
    return {"response": no_match_msg}
