import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertyService } from '../property/property.service';
import { PropertyFilterDto } from '../property/dto/property-query.dto';
import { ZONE_BUILDINGS } from '../tenant/tenant.mappers';
import { TenantUnit } from '../tenant/tenant.types';
import { MatchmakerRequestDto } from './dto/matchmaker-request.dto';
import { UnitStatus } from '@prisma/client';

const floorBand = (floor: number): 'low' | 'mid' | 'high' => (floor <= 10 ? 'low' : floor <= 20 ? 'mid' : 'high');

/** Bộ lọc cứng ngoài ngân sách (layout, phân khu/toà, tầng, nội thất, đồ dùng, thú cưng). Thiếu tiêu chí ⇒ không lọc. */
function passesFilters(unit: TenantUnit, dto: MatchmakerRequestDto): boolean {
  if (dto.layouts?.length && !dto.layouts.includes(unit.layout)) return false;
  if (dto.buildings?.length) {
    if (!dto.buildings.includes(unit.building)) return false;
  } else if (dto.zones?.length) {
    const allowed = dto.zones.flatMap((z) => ZONE_BUILDINGS[z] ?? []);
    if (!allowed.includes(unit.building)) return false;
  }
  if (dto.floor && floorBand(unit.floor) !== dto.floor) return false;
  if (dto.furnishing && unit.furnishing !== dto.furnishing) return false;
  if (dto.items?.length && !dto.items.every((i) => (unit.items ?? []).includes(i))) return false;
  if (dto.pets && !unit.petFriendly) return false;
  return true;
}

@Injectable()
export class MatchmakerService {
  private readonly logger = new Logger(MatchmakerService.name);

  constructor(
    private prisma: PrismaService,
    private propertyService: PropertyService,
  ) {}

  async findTopRecommendations(dto: MatchmakerRequestDto) {
    const startTime = Date.now();
    const { maxAllInBudget, preferredLayout, motorbikes = 1, cars = 0, occupants = 2, limit = 3 } = dto;

    // 1. Quét toàn bộ rổ hàng AVAILABLE thông qua PropertyService (một layout ⇒ lọc ngay ở DB).
    const filter: PropertyFilterDto = { status: UnitStatus.AVAILABLE, motorbikes, cars, occupants };
    if (preferredLayout) filter.layoutType = preferredLayout;
    else if (dto.layouts?.length === 1) filter.layout = dto.layouts[0];
    const scannedUnits = await this.propertyService.getUnits(filter);

    const totalScanned = scannedUnits.length;
    const enrichedUnits = scannedUnits.filter((u) => passesFilters(u, dto)).map((item) => {
      const baseRent = Number(item.rent);
      const managementFee = Number(item.managementFee);
      const parkingFee = motorbikes * 150000 + cars * 1250000;
      const utilityCost = occupants * 300000;
      const allInTotal = baseRent + managementFee + parkingFee + utilityCost;
      const marketAllInEstimate = Number(item.marketAvg) + managementFee + parkingFee + utilityCost;
      const savingAmount = Math.max(0, marketAllInEstimate - allInTotal);
      const savingPercentage = marketAllInEstimate > 0 ? Math.round((savingAmount / marketAllInEstimate) * 100) : 0;
      return {
        ...item,
        allInCost: { baseRent, managementFee, parkingFee, utilityCost, allInTotal },
        costComparison: {
          marketAllInEstimate,
          savingAmount,
          savingPercentage,
          isBargain: savingPercentage >= 10,
        },
      };
    });

    // 2. Lọc cứng theo trần ngân sách All-in (Hard Constraints); không có ngân sách ⇒ không loại căn nào.
    const eligibleUnits =
      maxAllInBudget != null ? enrichedUnits.filter((item) => item.allInCost.allInTotal <= maxAllInBudget) : enrichedUnits;

    const eliminatedCount = totalScanned - eligibleUnits.length;

    // 3. Xếp hạng Ranking (Ưu tiên mức tiết kiệm so với thị trường + độ tin cậy)
    eligibleUnits.sort((a: any, b: any) => {
      // Ưu tiên tỷ lệ tiết kiệm %
      const diffSaving = b.costComparison.savingPercentage - a.costComparison.savingPercentage;
      if (diffSaving !== 0) return diffSaving;
      // Nếu bằng nhau, ưu tiên giá All-in thấp hơn
      return a.allInCost.allInTotal - b.allInCost.allInTotal;
    });

    const top3 = eligibleUnits.slice(0, limit).map((item: any, index: number) => {
      const savingMonthly = item.costComparison.savingAmount;
      return {
        rank: index + 1,
        /** Khoá xếp hạng chính (= % tiết kiệm All-in so với giá tham chiếu); bằng nhau thì All-in thấp hơn đứng trước. */
        score: item.costComparison.savingPercentage,
        unitId: item.id,
        unitCode: item.code,
        buildingCode: item.building,
        zoneName: item.zoneName,
        layoutType: item.layout,
        carpetAreaM2: item.areaM2,
        floor: item.floor,
        furnishing: item.furnishing,
        petFriendly: item.petFriendly,
        allInCost: item.allInCost,
        comparison: item.costComparison,
        aiExplanation: `Căn ${item.code} giúp bạn tiết kiệm ${savingMonthly.toLocaleString('vi-VN')} đ/tháng (${item.costComparison.savingPercentage}%) so với giá thuê tham chiếu cùng phân khu ${item.zoneName}, bao gồm toàn bộ phí BQL và định mức sinh hoạt.`,
        verifiedImages: item.photos,
      };
    });

    const executionTimeMs = Date.now() - startTime;

    return {
      scanSummary: {
        totalScannedUnits: totalScanned,
        eliminatedUnits: eliminatedCount,
        matchedUnits: top3.length,
        totalMatched: eligibleUnits.length, // số căn khớp trước khi cắt theo limit
        executionTimeSeconds: (executionTimeMs / 1000).toFixed(2),
      },
      topRecommendations: top3,
    };
  }
}
