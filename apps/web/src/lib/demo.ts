import {
  computePerformance,
  daysInMonth,
  periodLabel,
  type DailySale,
  type PerformanceReport,
  type WeekBucket,
} from "@dpms/core";
import type { DashboardData, Distributor, GroupRow, ImportHistoryItem, PerformanceRow, Zone } from "./types";

/**
 * Données FICTIVES du mode démonstration : 34 distributeurs répartis comme
 * dans le modèle réel (6 régions), noms et numéros inventés.
 */
const REGIONS: [string, string[]][] = [
  ["Bas Oubangui", ["BANGUI"]],
  ["Plateaux", ["MBAIKI", "YALOKE", "BODA"]],
  ["Kagas", ["BAMBARI", "SIBUT", "BANDORO"]],
  ["Haut Oubangui", ["BANGASSOU", "OBO", "BIRAO"]],
  ["Yade", ["BOSSANGOA", "BOZOUM", "PAOUA"]],
  ["Equateur", ["BOUAR", "BELOKO", "BERBERATI", "GAMBOULA"]],
];
const COUNTS = [12, 3, 5, 3, 4, 7];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoDistributor {
  id: string;
  name: string;
  region: string;
  city: string;
  phone: string;
  objectiveHt: number;
  pace: number;
}

const demoDistributors: DemoDistributor[] = (() => {
  const rand = rng(42);
  const out: DemoDistributor[] = [];
  let n = 1;
  REGIONS.forEach(([region, cities], ri) => {
    for (let i = 0; i < COUNTS[ri]!; i++) {
      const num = String(n).padStart(2, "0");
      out.push({
        id: `demo-${num}`,
        name: `DISTRIBUTEUR ${num}`,
        region,
        city: cities[i % cities.length]!,
        phone: `+2367000${String(10000 + n).slice(1)}`,
        objectiveHt: Math.round((3 + rand() * 12) * 1e6 / 1e5) * 1e5,
        pace: 0.55 + rand() * 0.75,
      });
      n++;
    }
  });
  return out;
})();

function weeksOf(period: string): WeekBucket[] {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const weeks: WeekBucket[] = [];
  let current: string[] = [];
  for (let d = 1; d <= daysInMonth(period); d++) {
    const iso = `${period}-${String(d).padStart(2, "0")}`;
    current.push(iso);
    const sunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
    if ((sunday && current.length > 2) || d === daysInMonth(period)) {
      weeks.push({ label: `s${weeks.length + 1}`, dates: current });
      current = [];
    }
  }
  return weeks;
}

const DEMO_PERIODS: { code: string; asOfDay: number }[] = [
  { code: "2025-11", asOfDay: 14 },
  { code: "2025-10", asOfDay: 31 },
];

function demoReport(period: string): PerformanceReport {
  const asOfDay = DEMO_PERIODS.find((p) => p.code === period)?.asOfDay ?? 14;
  const rand = rng(period.split("-").reduce((a, b) => a * 100 + Number(b), 0));
  const sales: DailySale[] = [];
  demoDistributors.forEach((d, i) => {
    const dailyTtc = (d.objectiveHt * 1.26 * d.pace) / daysInMonth(period);
    for (let day = 1; day <= asOfDay; day++) {
      const date = `${period}-${String(day).padStart(2, "0")}`;
      if (rand() < 0.12) continue; // jour sans vente
      const amount = dailyTtc * (0.4 + rand() * 1.2);
      const zebraShare = 0.55 + rand() * 0.25;
      sales.push({ distributorIndex: i, date, product: "zebra", amount: Math.round(amount * zebraShare / 500) * 500 });
      sales.push({ distributorIndex: i, date, product: "dw", amount: Math.round(amount * (1 - zebraShare) / 500) * 500 });
    }
  });
  return computePerformance({
    period,
    weeks: weeksOf(period),
    distributors: demoDistributors.map((d) => ({ ...d, objectiveTtc: null })),
    sales,
  });
}

const toGroup = (g: PerformanceReport["total"]): GroupRow => ({
  ...g,
  projection: g.projectionFinMois,
});

export function reportToDashboard(
  report: PerformanceReport,
  meta: {
    periods: { code: string; label: string }[];
    rowsMeta: { id: string; city: string; phone: string | null; active: boolean }[];
    lastImport: DashboardData["lastImport"];
  },
): DashboardData {
  const rows: PerformanceRow[] = report.distributors.map((d, i) => ({
    ...d,
    projection: d.projectionFinMois,
    distributorId: meta.rowsMeta[i]!.id,
    city: meta.rowsMeta[i]!.city,
    phone: meta.rowsMeta[i]!.phone,
    active: meta.rowsMeta[i]!.active,
  }));
  return {
    period: report.period,
    periods: meta.periods,
    asOf: report.asOf,
    joursDansMois: report.joursDansMois,
    joursEcoules: report.joursEcoules,
    joursRestants: report.joursRestants,
    total: toGroup(report.total),
    regions: report.regions.map(toGroup),
    rows,
    lastImport: meta.lastImport,
  };
}

export function demoDashboard(period?: string): DashboardData {
  const code = DEMO_PERIODS.some((p) => p.code === period) ? period! : DEMO_PERIODS[0]!.code;
  return reportToDashboard(demoReport(code), {
    periods: DEMO_PERIODS.map((p) => ({ code: p.code, label: periodLabel(p.code) })),
    rowsMeta: demoDistributors.map((d) => ({ id: d.id, city: d.city, phone: d.phone, active: true })),
    lastImport: { fileName: "Classeur-demo.xlsx", createdAt: `${code}-${code === "2025-11" ? "14" : "31"}T18:00:00Z` },
  });
}

export function demoZones(): Zone[] {
  return REGIONS.map(([name]) => ({ id: `zone-${name}`, name }));
}

export function demoDistributorList(): Distributor[] {
  return demoDistributors.map((d) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    rawPhone: d.phone.slice(4),
    city: d.city,
    zoneId: `zone-${d.region}`,
    zoneName: d.region,
    active: true,
  }));
}

export function demoImports(): ImportHistoryItem[] {
  return [
    { id: "imp-2", period: "2025-11", fileName: "Classeur-demo.xlsx", status: "applied", nbDistributors: 34, nbSales: 820, nbIssues: 0, createdAt: "2025-11-14T18:00:00Z" },
    { id: "imp-1", period: "2025-10", fileName: "Octobre-demo.xlsx", status: "applied", nbDistributors: 34, nbSales: 1850, nbIssues: 2, createdAt: "2025-10-31T19:30:00Z" },
  ];
}
