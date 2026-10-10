import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const OCEAN_PARK_1_BUILDINGS = [
  // The Sapphire 1
  { buildingCode: 'S1.01', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.999512, lobbyLongitude: 105.945821 },
  { buildingCode: 'S1.02', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.998412, lobbyLongitude: 105.945281 },
  { buildingCode: 'S1.03', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.997812, lobbyLongitude: 105.944981 },
  { buildingCode: 'S1.05', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.999152, lobbyLongitude: 105.946123 },
  { buildingCode: 'S1.06', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.999350, lobbyLongitude: 105.946450 },
  { buildingCode: 'S1.07', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.999100, lobbyLongitude: 105.946650 },
  { buildingCode: 'S1.08', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.998901, lobbyLongitude: 105.946892 },
  { buildingCode: 'S1.09', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.998200, lobbyLongitude: 105.947050 },
  { buildingCode: 'S1.10', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.997541, lobbyLongitude: 105.947211 },
  { buildingCode: 'S1.11', zoneName: 'The Sapphire 1', totalFloors: 28, lobbyLatitude: 20.997200, lobbyLongitude: 105.947650 },
  { buildingCode: 'S1.12', zoneName: 'The Sapphire 1', totalFloors: 27, lobbyLatitude: 20.996891, lobbyLongitude: 105.948123 },

  // The Sapphire 2
  { buildingCode: 'S2.01', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.996541, lobbyLongitude: 105.942189 },
  { buildingCode: 'S2.02', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.996200, lobbyLongitude: 105.942650 },
  { buildingCode: 'S2.03', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.995950, lobbyLongitude: 105.942850 },
  { buildingCode: 'S2.05', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.995812, lobbyLongitude: 105.943121 },
  { buildingCode: 'S2.06', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.995400, lobbyLongitude: 105.943600 },
  { buildingCode: 'S2.07', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994912, lobbyLongitude: 105.944123 },
  { buildingCode: 'S2.08', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994650, lobbyLongitude: 105.944400 },
  { buildingCode: 'S2.09', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994350, lobbyLongitude: 105.944750 },
  { buildingCode: 'S2.10', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.994050, lobbyLongitude: 105.945100 },
  { buildingCode: 'S2.11', zoneName: 'The Sapphire 2', totalFloors: 30, lobbyLatitude: 20.993800, lobbyLongitude: 105.945400 },
  { buildingCode: 'S2.12', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.994123, lobbyLongitude: 105.942891 },
  { buildingCode: 'S2.15', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993850, lobbyLongitude: 105.942400 },
  { buildingCode: 'S2.16', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993650, lobbyLongitude: 105.942100 },
  { buildingCode: 'S2.17', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993450, lobbyLongitude: 105.941900 },
  { buildingCode: 'S2.18', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993512, lobbyLongitude: 105.941821 },
  { buildingCode: 'S2.19', zoneName: 'The Sapphire 2', totalFloors: 26, lobbyLatitude: 20.993200, lobbyLongitude: 105.941500 },

  // The Zenpark
  { buildingCode: 'R1.01', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991200, lobbyLongitude: 105.938600 },
  { buildingCode: 'R1.02', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991512, lobbyLongitude: 105.938912 },
  { buildingCode: 'R1.03', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991750, lobbyLongitude: 105.939100 },
  { buildingCode: 'R1.05', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.992050, lobbyLongitude: 105.939500 },
  { buildingCode: 'ZR1', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.992141, lobbyLongitude: 105.939812 },
  { buildingCode: 'ZR2', zoneName: 'The Zenpark', totalFloors: 31, lobbyLatitude: 20.991823, lobbyLongitude: 105.939211 },

  // The Pavilion
  { buildingCode: 'P1', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.992800, lobbyLongitude: 105.937200 },
  { buildingCode: 'P2', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.993000, lobbyLongitude: 105.937500 },
  { buildingCode: 'P3', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.993050, lobbyLongitude: 105.937650 },
  { buildingCode: 'P4', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.993121, lobbyLongitude: 105.937812 },
  { buildingCode: 'BE3', zoneName: 'The Pavilion', totalFloors: 30, lobbyLatitude: 20.990812, lobbyLongitude: 105.936512 },

  // Masteri Waterfront
  { buildingCode: 'M1', zoneName: 'Masteri Waterfront', totalFloors: 30, lobbyLatitude: 20.995350, lobbyLongitude: 105.948600 },
  { buildingCode: 'M2', zoneName: 'Masteri Waterfront', totalFloors: 30, lobbyLatitude: 20.995123, lobbyLongitude: 105.948912 },
  { buildingCode: 'M3', zoneName: 'Masteri Waterfront', totalFloors: 30, lobbyLatitude: 20.994812, lobbyLongitude: 105.949211 },
  { buildingCode: 'H1', zoneName: 'Masteri Waterfront', totalFloors: 26, lobbyLatitude: 20.996123, lobbyLongitude: 105.947812 },
  { buildingCode: 'H2', zoneName: 'Masteri Waterfront', totalFloors: 26, lobbyLatitude: 20.995800, lobbyLongitude: 105.948100 },
  { buildingCode: 'H3', zoneName: 'Masteri Waterfront', totalFloors: 26, lobbyLatitude: 20.995500, lobbyLongitude: 105.948400 },
];

async function main() {
  console.log(`👉 Upserting ${OCEAN_PARK_1_BUILDINGS.length} buildings for Vinhomes Ocean Park 1...`);
  let count = 0;
  for (const b of OCEAN_PARK_1_BUILDINGS) {
    await prisma.building.upsert({
      where: { buildingCode: b.buildingCode },
      update: {
        zoneName: b.zoneName,
        totalFloors: b.totalFloors,
        lobbyLatitude: b.lobbyLatitude,
        lobbyLongitude: b.lobbyLongitude,
      },
      create: b,
    });
    count++;
  }
  console.log(`✅ Upserted ${count} buildings successfully.`);
  const total = await prisma.building.count();
  console.log(`Total buildings in DB now: ${total}`);
}

main()
  .catch((e) => {
    console.error('Error seeding buildings:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
