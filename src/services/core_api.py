"""Client gọi Core API (backend NestJS) — nguồn sự thật duy nhất của rổ hàng và thứ hạng căn (AI Matchmaker)."""

from typing import Any

import httpx

from src.config import get_settings


class CoreApiError(Exception):
    """Không gọi được / Core API trả lỗi. Caller KHÔNG được dựng danh sách căn thay thế."""


def recommend(body: dict[str, Any]) -> dict[str, Any]:
    """`POST {CORE_API_URL}/matchmaker/recommend` — trả `data` của envelope `{success, data}`."""
    settings = get_settings()
    url = f"{settings.core_api_url.rstrip('/')}/matchmaker/recommend"
    try:
        res = httpx.post(url, json=body, timeout=settings.core_api_timeout_s)
    except httpx.HTTPError as exc:
        raise CoreApiError(f"core_api_unreachable: {type(exc).__name__}") from exc
    if res.status_code >= 400:
        raise CoreApiError(f"core_api_http_{res.status_code}")
    try:
        payload = res.json()
    except ValueError as exc:
        raise CoreApiError("core_api_bad_json") from exc
    data = payload.get("data", payload) if isinstance(payload, dict) else None
    if not isinstance(data, dict) or not isinstance(data.get("topRecommendations"), list):
        raise CoreApiError("core_api_bad_shape")
    return data


async def probe(timeout_s: float = 2.0) -> bool:
    """Kiểm tra lúc khởi động: có phản hồi HTTP bất kỳ từ origin của Core API ⇒ tới được."""
    settings = get_settings()
    origin = httpx.URL(settings.core_api_url).copy_with(path="/", query=None)
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            await client.get(str(origin))
        return True
    except httpx.HTTPError:
        return False
