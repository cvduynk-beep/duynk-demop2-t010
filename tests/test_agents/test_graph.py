import pytest
from pydantic import ValidationError

from src.agents.graph import agent
from src.agents.tools import oceanpark_catalog
from src.agents.tools.all_in_calculator import calculate_all_in_cost
from src.config import Settings
from src.services.core_api import CoreApiError


def _rec(rank: int, code: str, all_in: int, saving: int) -> dict:
    return {
        "rank": rank,
        "score": saving,
        "unitCode": code,
        "buildingCode": code.split("-")[1],
        "zoneName": "The Sapphire 2",
        "layoutType": "1PN",
        "carpetAreaM2": 47,
        "floor": 12,
        "allInCost": {
            "baseRent": all_in - 1_000_000,
            "managementFee": 446_500,
            "parkingFee": 150_000,
            "utilityCost": 403_500,
            "allInTotal": all_in,
        },
        "comparison": {
            "marketAllInEstimate": all_in + 900_000,
            "savingAmount": 900_000,
            "savingPercentage": saving,
            "isBargain": saving >= 10,
        },
        "aiExplanation": "",
    }


# Thứ tự CỐ Ý không theo All-in tăng dần để bắt lỗi agent tự xếp lại.
RANKED = [
    _rec(1, "VHOP-S2.05-1808", 8_400_000, 12),
    _rec(2, "VHOP-S2.01-0905", 7_900_000, 8),
    _rec(3, "VHOP-S2.09-1203", 8_100_000, 2),
]


@pytest.fixture(autouse=True)
def no_gemini(monkeypatch):
    """Test không bao giờ gọi LLM thật."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)


@pytest.fixture
def core_api(monkeypatch):
    calls: list[dict] = []

    def fake_recommend(body: dict) -> dict:
        calls.append(body)
        budget = body.get("maxAllInBudget")
        top = [r for r in RANKED if budget is None or r["allInCost"]["allInTotal"] <= budget]
        return {"scanSummary": {"totalScannedUnits": 54, "totalMatched": len(top)}, "topRecommendations": top}

    monkeypatch.setattr(oceanpark_catalog, "recommend", fake_recommend)
    return calls


@pytest.mark.asyncio
async def test_agent_basic_flow(core_api):
    result = await agent.ainvoke({"query": "Tìm căn hộ 1PN+ tại Sapphire 2 dưới 8.5 triệu"})
    assert "response" in result
    assert len(result["matched_units"]) > 0
    assert core_api[0]["maxAllInBudget"] == 8_500_000
    assert core_api[0]["zones"] == ["sapphire2"]
    assert core_api[0]["layouts"] == ["1PN"]


@pytest.mark.asyncio
async def test_agent_keeps_matchmaker_order(core_api):
    """Bất biến: thứ tự căn = thứ tự Core API trả (không sắp lại theo All-in hay bất cứ gì)."""
    result = await agent.ainvoke({"query": "Tìm căn hộ dưới 9 triệu ở Ocean Park"})
    assert [u["unit_code"] for u in result["matched_units"]] == [r["unitCode"] for r in RANKED]
    assert [u["rank"] for u in result["matched_units"]] == [1, 2, 3]


@pytest.mark.asyncio
async def test_agent_budget_ceiling_hard_filter(core_api):
    """Bất biến: 100% căn gợi ý không vượt ngân sách trần All-in (backend lọc, agent truyền đúng trần)."""
    budget_ceiling = 8_200_000
    result = await agent.ainvoke({"query": f"Tìm căn hộ dưới {budget_ceiling:,.0f} đ ở Ocean Park"})
    matched = result.get("matched_units", [])
    assert len(matched) > 0
    for unit in matched:
        assert unit["all_in_total"] <= budget_ceiling, f"Căn {unit['unit_code']} vượt ngân sách trần All-in!"


@pytest.mark.asyncio
async def test_agent_core_api_down_returns_text_only(monkeypatch):
    def boom(body: dict) -> dict:
        raise CoreApiError("core_api_unreachable: ConnectError")

    monkeypatch.setattr(oceanpark_catalog, "recommend", boom)
    result = await agent.ainvoke({"query": "Tìm căn studio dưới 8 triệu"})
    assert result["matched_units"] == []
    assert "chưa tải được danh sách" in result["response"]


def test_catalog_has_no_hardcoded_units():
    assert not hasattr(oceanpark_catalog, "RAW_UNITS")


def test_core_api_url_validated_at_startup():
    with pytest.raises(ValidationError):
        Settings(core_api_url="localhost:4000/api/v1")
    with pytest.raises(ValidationError):
        Settings(core_api_url="ftp://x/api")
    assert Settings(core_api_url="http://localhost:4000/api/v1/").core_api_url == "http://localhost:4000/api/v1"


@pytest.mark.asyncio
async def test_agent_policy_faq():
    """Kiểm tra giải đáp chính sách cọc 2 triệu giữ chỗ 48h."""
    result = await agent.ainvoke({"query": "Chính sách cọc giữ chỗ 2 triệu như thế nào?"})
    assert "response" in result
    assert "2.000.000" in result["response"]
    assert "48 giờ" in result["response"]


def test_all_in_cost_formula():
    """Kiểm tra công thức All-in Cost: Giá thuê + Quản lý (9.5k/m2) + Xe (150k) + Điện nước (300k/người)."""
    cost = calculate_all_in_cost(
        base_rent=6_500_000,
        carpet_area_m2=47.0,
        market_avg_price=7_400_000,
        motorbikes=1,
        cars=0,
        occupants=2,
    )
    expected_mgmt = round(47.0 * 9500)  # 446.500 đ
    expected_parking = 150_000
    expected_utility = 600_000
    expected_total = 6_500_000 + expected_mgmt + expected_parking + expected_utility

    assert cost["management_fee"] == expected_mgmt
    assert cost["parking_fee"] == expected_parking
    assert cost["utility_cost"] == expected_utility
    assert cost["all_in_total"] == expected_total


def test_bargain_badge_detection():
    """Căn tiết kiệm >= 10% so với thị trường tự động nhận badge 'Căn hời'."""
    cost = calculate_all_in_cost(
        base_rent=4_500_000,
        carpet_area_m2=31.0,
        market_avg_price=5_500_000,
    )
    assert cost["is_bargain"] is True
    assert "CĂN HỜI" in cost["badge_text"]
