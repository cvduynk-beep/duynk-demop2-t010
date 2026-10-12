"""
VinStay AI - Gemini Flash LLM Client & Prompts
Tích hợp Google Gemini Flash (gemini-2.0-flash / gemini-1.5-flash) vào luồng LangGraph Agent:
- Trích xuất ý định (Intent) và thực thể (Criteria extraction) với độ trễ siêu thấp.
- Sinh lời thoại tư vấn cá nhân hóa, thấu hiểu ngữ cảnh Vinhomes Ocean Park và All-in Cost.
- Hỗ trợ Graceful Fallback tự động khi chưa thiết lập API key hoặc lỗi mạng.
"""

import json
import logging
import os
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")


def extract_text_from_content(content: Any) -> str:
    """Trích xuất chuỗi văn bản sạch từ LangChain message content (hỗ trợ cả string và list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, dict) and "text" in p:
                parts.append(p["text"])
            elif isinstance(p, str):
                parts.append(p)
        return "".join(parts)
    return str(content)


def get_gemini_llm(temperature: float = 0.0) -> Any:
    """Khởi tạo instance ChatGoogleGenerativeAI nếu có API key hợp lệ."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key or api_key.startswith("sk-") or "your-key" in api_key:
        return None

    try:
        from langchain_google_genai import ChatGoogleGenerativeAI

        model_name = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
        return ChatGoogleGenerativeAI(
            model=model_name,
            google_api_key=api_key,
            temperature=temperature,
            max_output_tokens=250,
            max_retries=2,
        )
    except Exception as e:
        logger.warning(f"Không thể khởi tạo ChatGoogleGenerativeAI: {e}")
        return None


def parse_intent_with_gemini(query: str, existing_criteria: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Sử dụng Gemini Flash để phân tích ngôn ngữ tự nhiên thành JSON tiêu chí."""
    llm = get_gemini_llm(temperature=0.0)
    if not llm:
        return None

    system_prompt = (
        "Bạn là bộ phân tích ý định tìm kiếm căn hộ cho nền tảng VinStay AI tại Vinhomes Ocean Park.\n"
        "Nhiệm vụ: Trích xuất thông tin từ câu chat của người dùng thành định dạng JSON duy nhất, không kèm giải thích markdown thừa.\n\n"
        "Các trường JSON cần trích xuất:\n"
        "- intent: 'search_unit' (tìm căn hộ), 'policy_faq' (hỏi nội quy BQL/chính sách cọc/tiền cọc), hoặc 'greeting'\n"
        "- budget_ceiling: Số tiền ngân sách trần All-in (VNĐ). Ví dụ: 'dưới 8.5 triệu' -> 8500000, '9 củ' -> 9000000, '8tr5' -> 8500000\n"
        "- layout_type: Một trong các giá trị: 'STUDIO', 'ONE_BED_PLUS', 'TWO_BED_TWO_BATH', 'THREE_BED' hoặc null\n"
        "- zone: 'Sapphire 1' hoặc 'Sapphire 2' hoặc null\n"
        "- occupants: Số người ở (mặc định 2 nếu không nói)\n"
        "- motorbikes: Số xe máy (mặc định 1 nếu không nói)\n"
        "- cars: Số ô tô (mặc định 0 nếu không nói)\n"
        "- highlights: Danh sách các tiện ích mong muốn (ví dụ: view hồ, nội thất full, tầng cao)\n\n"
        "Ví dụ người dùng: 'Tìm căn 2pn ở s2 dưới 9 triệu cho 2 vợ chồng 1 xe máy'\n"
        "JSON output:\n"
        "{\n"
        '  "intent": "search_unit",\n'
        '  "budget_ceiling": 9000000,\n'
        '  "layout_type": "TWO_BED_TWO_BATH",\n'
        '  "zone": "Sapphire 2",\n'
        '  "occupants": 2,\n'
        '  "motorbikes": 1,\n'
        '  "cars": 0\n'
        "}"
    )

    try:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Câu người dùng: {query}"),
        ]
        response = llm.invoke(messages)
        content = extract_text_from_content(response.content if hasattr(response, "content") else response)

        # Lọc bỏ markdown codeblock nếu có
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
            return parsed
    except Exception as e:
        logger.warning(f"Lỗi khi gọi Gemini Flash parse_intent: {e}")

    return None


def generate_response_with_gemini(
    matched_units: list[dict[str, Any]],
    criteria: dict[str, Any],
    policy_answer: str | None,
    user_query: str,
) -> str | None:
    """Sử dụng Gemini Flash để sinh lời tư vấn sinh động, lịch thiệp và minh bạch 100% All-in Cost."""
    llm = get_gemini_llm(temperature=0.2)
    if not llm:
        return None

    system_prompt = (
        "Bạn là Vinny - AI Quản Gia Số tư vấn căn hộ Vinhomes Ocean Park của nền tảng VinStay AI.\n"
        "QUY TẮC BẢO VỆ NGHIÊM NGẶT (STRICT GUARDRAILS):\n"
        "1. Lịch thiệp, tự nhiên, văn minh và am hiểu thực tế đại đô thị Vinhomes Ocean Park (Gia Lâm).\n"
        "2. CHỈ tư vấn căn hộ, giá thuê All-in Cost, tiện ích và quy chế BQL tại Vinhomes Ocean Park. Nếu khách hỏi ngoài lề (toán học, viết mã, thơ, chính trị, dịch vụ ngoài Ocean Park...): Từ chối lịch sự bằng 1 câu duy nhất và mời khách quay lại tìm phòng.\n"
        "3. Minh bạch 100% All-in Cost: Giải thích rõ giá thuê gốc và tổng chi phí đã gồm (Phí QL BQL 9.5k/m2, Xe máy 150k, Xe con 1.25M, Điện nước).\n"
        "4. Kêu gọi hành động rõ ràng: Khách có thể 'Đặt lịch xem phòng' (Host đón tại sảnh bằng thẻ cư dân trong 60 giây) hoặc 'Quét VietQR cọc 2.000.000đ giữ chỗ 48h'.\n"
        "5. Nếu có căn đạt nhãn 'Căn hời phân khu', nhấn mạnh số tiền tiết kiệm được hàng tháng so với thị trường.\n"
        "6. Giới hạn trả lời súc tích dưới 80 từ, dùng emoji tinh tế."
    )

    data_payload = {
        "user_query": user_query,
        "criteria": criteria,
        "matched_units": matched_units,
        "policy_answer": policy_answer,
    }

    try:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(
                content=f"Hãy tư vấn cho khách dựa trên dữ liệu sau (nêu rõ các căn Top và tổng All-in):\n{json.dumps(data_payload, ensure_ascii=False, indent=2)}"
            ),
        ]
        response = llm.invoke(messages)
        res_text = extract_text_from_content(response.content if hasattr(response, "content") else response)
        if res_text:
            return res_text.strip()
        if hasattr(response, "content") and response.content:
            return response.content.strip()
    except Exception as e:
        logger.warning(f"Lỗi khi gọi Gemini Flash generate_response: {e}")

    return None
