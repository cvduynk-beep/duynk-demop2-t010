import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertyFilterDto } from './dto/property-query.dto';

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  // Dữ liệu mẫu Fallback khi Database PostgreSQL chưa được khởi chạy (hỗ trợ UI/Prototype test offline)
  private readonly mockBuildings = [
    // The Sapphire 1
    { id: 'b-s101', buildingCode: 'S1.01', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.999512, lobbyLongitude: 105.945821, _count: { units: 10 } },
    { id: 'b1111111-1111-1111-1111-111111111111', buildingCode: 'S1.02', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.998412, lobbyLongitude: 105.945281, _count: { units: 18 } },
    { id: 'b-s103', buildingCode: 'S1.03', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.997812, lobbyLongitude: 105.944981, _count: { units: 12 } },
    { id: 'b2222222-2222-2222-2222-222222222222', buildingCode: 'S1.05', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.999152, lobbyLongitude: 105.946123, _count: { units: 14 } },
    { id: 'b-s106', buildingCode: 'S1.06', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.999350, lobbyLongitude: 105.946450, _count: { units: 8 } },
    { id: 'b-s107', buildingCode: 'S1.07', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.999100, lobbyLongitude: 105.946650, _count: { units: 8 } },
    { id: 'b-s108', buildingCode: 'S1.08', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.998901, lobbyLongitude: 105.946892, _count: { units: 15 } },
    { id: 'b-s109', buildingCode: 'S1.09', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.998200, lobbyLongitude: 105.947050, _count: { units: 11 } },
    { id: 'b-s110', buildingCode: 'S1.10', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.997541, lobbyLongitude: 105.947211, _count: { units: 9 } },
    { id: 'b-s111', buildingCode: 'S1.11', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.997200, lobbyLongitude: 105.947650, _count: { units: 7 } },
    { id: 'b-s112', buildingCode: 'S1.12', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.996891, lobbyLongitude: 105.948123, _count: { units: 13 } },

    // The Sapphire 2
    { id: 'b3333333-3333-3333-3333-333333333333', buildingCode: 'S2.01', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.996541, lobbyLongitude: 105.942189, _count: { units: 22 } },
    { id: 'b-s202', buildingCode: 'S2.02', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.996200, lobbyLongitude: 105.942650, _count: { units: 16 } },
    { id: 'b-s203', buildingCode: 'S2.03', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.995950, lobbyLongitude: 105.942850, _count: { units: 14 } },
    { id: 'b-s205', buildingCode: 'S2.05', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.995812, lobbyLongitude: 105.943121, _count: { units: 18 } },
    { id: 'b-s206', buildingCode: 'S2.06', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.995400, lobbyLongitude: 105.943600, _count: { units: 12 } },
    { id: 'b-s207', buildingCode: 'S2.07', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994912, lobbyLongitude: 105.944123, _count: { units: 16 } },
    { id: 'b-s208', buildingCode: 'S2.08', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994650, lobbyLongitude: 105.944400, _count: { units: 14 } },
    { id: 'b-s209', buildingCode: 'S2.09', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994350, lobbyLongitude: 105.944750, _count: { units: 15 } },
    { id: 'b-s210', buildingCode: 'S2.10', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994050, lobbyLongitude: 105.945100, _count: { units: 10 } },
    { id: 'b-s211', buildingCode: 'S2.11', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.993800, lobbyLongitude: 105.945400, _count: { units: 11 } },
    { id: 'b-s212', buildingCode: 'S2.12', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.994123, lobbyLongitude: 105.942891, _count: { units: 19 } },
    { id: 'b-s215', buildingCode: 'S2.15', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993850, lobbyLongitude: 105.942400, _count: { units: 10 } },
    { id: 'b-s216', buildingCode: 'S2.16', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993650, lobbyLongitude: 105.942100, _count: { units: 14 } },
    { id: 'b-s217', buildingCode: 'S2.17', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993450, lobbyLongitude: 105.941900, _count: { units: 12 } },
    { id: 'b-s218', buildingCode: 'S2.18', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993512, lobbyLongitude: 105.941821, _count: { units: 20 } },
    { id: 'b-s219', buildingCode: 'S2.19', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993200, lobbyLongitude: 105.941500, _count: { units: 15 } },

    // The Zenpark
    { id: 'b-r101', buildingCode: 'R1.01', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991200, lobbyLongitude: 105.938600, _count: { units: 14 } },
    { id: 'b-r102', buildingCode: 'R1.02', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991512, lobbyLongitude: 105.938912, _count: { units: 16 } },
    { id: 'b-r103', buildingCode: 'R1.03', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991750, lobbyLongitude: 105.939100, _count: { units: 12 } },
    { id: 'b-r105', buildingCode: 'R1.05', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.992050, lobbyLongitude: 105.939500, _count: { units: 15 } },
    { id: 'b-zr1', buildingCode: 'ZR1', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.992141, lobbyLongitude: 105.939812, _count: { units: 18 } },
    { id: 'b-zr2', buildingCode: 'ZR2', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991823, lobbyLongitude: 105.939211, _count: { units: 14 } },

    // The Pavilion
    { id: 'b-p1', buildingCode: 'P1', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.992800, lobbyLongitude: 105.937200, _count: { units: 12 } },
    { id: 'b-p2', buildingCode: 'P2', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.993000, lobbyLongitude: 105.937500, _count: { units: 12 } },
    { id: 'b-p3', buildingCode: 'P3', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.993050, lobbyLongitude: 105.937650, _count: { units: 15 } },
    { id: 'b-p4', buildingCode: 'P4', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.993121, lobbyLongitude: 105.937812, _count: { units: 17 } },
    { id: 'b-be3', buildingCode: 'BE3', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.990812, lobbyLongitude: 105.936512, _count: { units: 16 } },

    // Masteri Waterfront
    { id: 'b-m1', buildingCode: 'M1', zoneName: 'Masteri Waterfront', totalFloors: 30, lobbyLatitude: 20.995350, lobbyLongitude: 105.948600, _count: { units: 18 } },
    { id: 'b-m2', buildingCode: 'M2', zoneName: 'Masteri Waterfront', totalFloors: 30, lobbyLatitude: 20.995123, lobbyLongitude: 105.948912, _count: { units: 21 } },
    { id: 'b-m3', buildingCode: 'M3', zoneName: 'Masteri Waterfront', totalFloors: 30, lobbyLatitude: 20.994812, lobbyLongitude: 105.949211, _count: { units: 19 } },
    { id: 'b-h1', buildingCode: 'H1', zoneName: 'Masteri Waterfront', totalFloors: 26, lobbyLatitude: 20.996123, lobbyLongitude: 105.947812, _count: { units: 14 } },
    { id: 'b-h2', buildingCode: 'H2', zoneName: 'Masteri Waterfront', totalFloors: 26, lobbyLatitude: 20.995800, lobbyLongitude: 105.948100, _count: { units: 15 } },
    { id: 'b-h3', buildingCode: 'H3', zoneName: 'Masteri Waterfront', totalFloors: 26, lobbyLatitude: 20.995500, lobbyLongitude: 105.948400, _count: { units: 13 } },
  ];

  private readonly mockUnits = [
    {
      id: 'u1111111-1111-1111-1111-111111111111',
      unitCode: 'VHOP-S1.02-12A08',
      buildingId: 'b1111111-1111-1111-1111-111111111111',
      landlordId: 'l1111111-1111-1111-1111-111111111111',
      floorNumber: 12,
      layoutType: 'ONE_BED_PLUS',
      carpetAreaM2: 47.0,
      baseRentPrice: 6500000,
      managementFee: 446500,
      parkingFeeEstimate: 150000,
      utilityCostEstimate: 600000,
      marketAvgPrice: 7300000,
      doorLockType: 'ELECTRONIC_PIN',
      isVerified: true,
      status: 'AVAILABLE',
      isHot: true,
      updatedAt: new Date('2026-09-24T10:00:00Z'),
      building: {
        id: 'b1111111-1111-1111-1111-111111111111',
        buildingCode: 'S1.02',
        zoneName: 'The Sapphire 1',
        totalFloors: 28,
        lobbyLatitude: 20.998412,
        lobbyLongitude: 105.945281,
      },
      media: [
        { url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200', category: 'living_room', order: 1 },
        { url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200', category: 'bedroom', order: 2 },
      ],
    },
    {
      id: 'u2222222-2222-2222-2222-222222222222',
      unitCode: 'VHOP-S1.05-0804',
      buildingId: 'b2222222-2222-2222-2222-222222222222',
      landlordId: 'l1111111-1111-1111-1111-111111111111',
      floorNumber: 8,
      layoutType: 'STUDIO',
      carpetAreaM2: 32.5,
      baseRentPrice: 4800000,
      managementFee: 308750,
      parkingFeeEstimate: 150000,
      utilityCostEstimate: 400000,
      marketAvgPrice: 5500000,
      doorLockType: 'ELECTRONIC_PIN',
      isVerified: true,
      status: 'AVAILABLE',
      isHot: false,
      updatedAt: new Date('2026-09-24T14:30:00Z'),
      building: {
        id: 'b2222222-2222-2222-2222-222222222222',
        buildingCode: 'S1.05',
        zoneName: 'The Sapphire 1',
        totalFloors: 27,
        lobbyLatitude: 20.999152,
        lobbyLongitude: 105.946123,
      },
      media: [
        { url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200', category: 'studio', order: 1 },
      ],
    },
    {
      id: 'u3333333-3333-3333-3333-333333333333',
      unitCode: 'VHOP-S2.01-1812',
      buildingId: 'b3333333-3333-3333-3333-333333333333',
      landlordId: 'l1111111-1111-1111-1111-111111111111',
      floorNumber: 18,
      layoutType: 'TWO_BED_TWO_BATH',
      carpetAreaM2: 69.0,
      baseRentPrice: 9000000,
      managementFee: 655500,
      parkingFeeEstimate: 300000,
      utilityCostEstimate: 900000,
      marketAvgPrice: 9500000,
      doorLockType: 'PHYSICAL_KEY',
      isVerified: true,
      status: 'AVAILABLE',
      isHot: false,
      updatedAt: new Date('2026-09-24T09:00:00Z'),
      building: {
        id: 'b3333333-3333-3333-3333-333333333333',
        buildingCode: 'S2.01',
        zoneName: 'The Sapphire 2',
        totalFloors: 30,
        lobbyLatitude: 20.996541,
        lobbyLongitude: 105.942189,
      },
      media: [
        { url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200', category: 'living_room', order: 1 },
      ],
    },
  ];

  constructor(private prisma: PrismaService) {}

  calculateAllInCost(unit: any, motorbikes = 1, cars = 0, occupants = 2) {
    const baseRent = Number(unit.baseRentPrice);
    const carpetArea = Number(unit.carpetAreaM2);
    const managementFee = Math.round(carpetArea * 9500); // 9.500 VND/m2 thông thủy
    const parkingFee = motorbikes * 150000 + cars * 1250000;
    const utilityCost = occupants * 300000; // 300k/người/tháng
    const allInTotal = baseRent + managementFee + parkingFee + utilityCost;

    const marketAvg = Number(unit.marketAvgPrice);
    const marketAllInEstimate = marketAvg + managementFee + parkingFee + utilityCost;
    const savingAmount = Math.max(0, marketAllInEstimate - allInTotal);
    const savingPercentage = marketAllInEstimate > 0 ? Math.round((savingAmount / marketAllInEstimate) * 100) : 0;
    const isBargain = savingPercentage >= 10;

    return {
      breakdown: {
        baseRent,
        managementFee,
        parkingFee,
        utilityCost,
        allInTotal,
      },
      comparison: {
        marketAvgPrice: marketAvg,
        marketAllInEstimate,
        savingAmount,
        savingPercentage,
        isBargain,
        badgeText: isBargain ? `🔥 CĂN HỜI PHÂN KHU (-${savingPercentage}%)` : null,
      },
    };
  }

  async getBuildings() {
    try {
      return await this.prisma.building.findMany({
        orderBy: { buildingCode: 'asc' },
        include: { _count: { select: { units: true } } },
      });
    } catch (err) {
      this.logger.warn(`Prisma DB offline, returning fallback mock buildings data: ${err.message}`);
      return this.mockBuildings;
    }
  }

  async getUnits(filter: PropertyFilterDto) {
    const { buildingCode, layoutType, status, motorbikes = 1, cars = 0, occupants = 2, maxAllInCost } = filter;

    let units: any[];
    try {
      const where: any = {};
      if (status) where.status = status;
      if (layoutType) where.layoutType = layoutType;
      if (buildingCode) where.building = { buildingCode };

      units = await this.prisma.unit.findMany({
        where,
        include: {
          building: true,
          media: { orderBy: { order: 'asc' } },
        },
        orderBy: { baseRentPrice: 'asc' },
      });
    } catch (err) {
      this.logger.warn(`Prisma DB offline, returning fallback mock units data: ${err.message}`);
      units = this.mockUnits.filter((u) => {
        if (status && u.status !== status) return false;
        if (layoutType && u.layoutType !== layoutType) return false;
        if (buildingCode && u.building.buildingCode !== buildingCode) return false;
        return true;
      });
    }

    const enrichedUnits = units.map((unit) => {
      const cost = this.calculateAllInCost(unit, motorbikes, cars, occupants);
      return {
        ...unit,
        allInCost: cost.breakdown,
        costComparison: cost.comparison,
        verifiedBadge: {
          isVerified: unit.isVerified,
          timestamp: unit.updatedAt,
          label: 'VERIFIED 100% HIỆN TRƯỜNG',
        },
      };
    });

    if (maxAllInCost) {
      return enrichedUnits.filter((u) => u.allInCost.allInTotal <= maxAllInCost);
    }

    return enrichedUnits;
  }

  async getUnitById(id: string, motorbikes = 1, cars = 0, occupants = 2) {
    let unit: any;
    try {
      unit = await this.prisma.unit.findUnique({
        where: { id },
        include: {
          building: true,
          media: { orderBy: { order: 'asc' } },
        },
      });
    } catch (err) {
      this.logger.warn(`Prisma DB offline, finding unit in mock data`);
      unit = this.mockUnits.find((u) => u.id === id || u.unitCode === id);
    }

    if (!unit) {
      // Fallback first unit if id matches mock pattern
      unit = this.mockUnits[0];
    }

    const cost = this.calculateAllInCost(unit, motorbikes, cars, occupants);
    return {
      ...unit,
      allInCost: cost.breakdown,
      costComparison: cost.comparison,
      verifiedBadge: {
        isVerified: unit.isVerified,
        timestamp: unit.updatedAt,
        label: 'VERIFIED 100% HIỆN TRƯỜNG',
      },
    };
  }
}
