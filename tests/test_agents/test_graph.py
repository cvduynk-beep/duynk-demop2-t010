import pytest

from src.agents.graph import agent
from src.agents.tools.all_in_calculator import calculate_all_in_cost


@pytest.mark.asyncio
async def test_agent_basic_flow():
    result = await agent.ainvoke({"query": "Tìm căn hộ 1PN+ tại Sapphire 2 dưới 8.5 triệu"})
    assert "response" in result
    assert "matched_units" in result
    assert len(result["matched_units"]) > 0


@pytest.mark.asyncio
async def test_agent_budget_ceiling_hard_filter():
    """Kiểm tra bất biến: 100% căn gợi ý không được vượt ngân sách trần All-in."""
    budget_ceiling = 8_500_000
    result = await agent.ainvoke({"query": f"Tìm căn hộ dưới {budget_ceiling:,.0f} đ ở Ocean Park"})
    matched = result.get("matched_units", [])
    assert len(matched) > 0
    for unit in matched:
        assert unit["all_in_total"] <= budget_ceiling, f"Căn {unit['unit_code']} vượt ngân sách trần All-in!"


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
