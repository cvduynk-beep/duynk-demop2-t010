import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/nav/SiteNav";
import { UnitDetail } from "@/components/unit/UnitDetail";
import { registerDynamicUnits, UNITS, unitAddress, unitById, zoneById, type Unit } from "@/lib/mock/units";
import { mapDbUnitToFrontendUnit } from "@/lib/property/unitAdapter";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4001").replace(/\/+$/, "");

async function getUnitOrFetch(id: string): Promise<Unit | undefined> {
  const local = unitById(id);
  if (local) return local;

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/properties/units/${id}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return undefined;
    const json = await res.json();
    const data = json.data || json;
    const mapped = mapDbUnitToFrontendUnit(data);
    registerDynamicUnits([mapped]);
    return mapped;
  } catch {
    return undefined;
  }
}

export function generateStaticParams() {
  return UNITS.map((u) => ({ id: u.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const unit = await getUnitOrFetch(id);
  if (!unit) return {};
  return { title: `Căn ${unitAddress(unit)} · ${zoneById(unit.zoneId).name}`, description: unit.title };
}

export default async function UnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ book?: string }> }) {
  const { id } = await params;
  const unit = await getUnitOrFetch(id);
  if (!unit) notFound();
  const { book } = await searchParams;
  return (
    <>
      <SiteNav />
      <main>
        <UnitDetail unit={unit} autoOpenBooking={book === "1"} />
      </main>
    </>
  );
}
