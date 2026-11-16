import "server-only";
import { DEFAULT_KPI_SETTINGS, periodLabel, type GroupPerformance } from "@dpms/core";
import { demoDashboard, demoDistributorList, demoImports, demoZones } from "./demo";
import { IS_DEMO } from "./env";
import { createClient } from "./supabase/server";
import type { DashboardData, Distributor, GroupRow, ImportHistoryItem, PerformanceRow, Zone } from "./types";

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`Lecture impossible (${what}) : ${error?.message ?? "erreur inconnue"}`);
}

function groupFromSummary(g: GroupPerformance): GroupRow {
  return { ...g, projection: g.projectionFinMois };
}

/** Tableau de bord d'un mois. null si aucun import n'a encore été fait. */
export async function getDashboard(period?: string): Promise<DashboardData | null> {
  if (IS_DEMO) return demoDashboard(period);
  const supabase = await createClient();

  const { data: periods, error: e1 } = await supabase
    .from("periods")
    .select("code, as_of, summary, last_import_id")
    .order("code", { ascending: false });
  if (e1) fail("périodes", e1);
  if (!periods?.length) return null;

  const current = periods.find((p) => p.code === period) ?? periods[0]!;
  const summary = current.summary as {
    jours_dans_mois: number;
    jours_ecoules: number;
    jours_restants: number;
    regions: GroupPerformance[];
    total: GroupPerformance;
  } | null;
  if (!summary) return null;

  const [{ data: perf, error: e2 }, { data: imp }] = await Promise.all([
    supabase
      .from("v_performances")
      .select("*")
      .eq("period_code", current.code)
      .order("rang", { ascending: true, nullsFirst: false }),
    current.last_import_id
      ? supabase.from("import_batches").select("file_name, created_at").eq("id", current.last_import_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (e2) fail("performances", e2);

  const rows: PerformanceRow[] = (perf ?? []).map((r) => ({
    distributorId: r.distributor_id,
    name: r.distributor_name,
    region: r.zone_name ?? "Sans région",
    city: r.city ?? "",
    phone: r.phone,
    active: r.active,
    rang: r.rang,
    rangRegion: r.rang_region,
    realiseZebra: num(r.realise_zebra),
    realiseDw: num(r.realise_dw),
    realiseTtc: num(r.realise_ttc),
    objectifHt: numOrNull(r.objectif_ht),
    objectifTtc: numOrNull(r.objectif_ttc),
    taux: numOrNull(r.taux),
    raf: numOrNull(r.raf),
    moyenneJournaliere: num(r.moyenne_journaliere),
    objectifJournalier: numOrNull(r.objectif_journalier),
    projection: num(r.projection),
    semaines: r.semaines ?? [],
  }));

  return {
    period: current.code,
    periods: periods.map((p) => ({ code: p.code, label: periodLabel(p.code) })),
    asOf: current.as_of,
    joursDansMois: summary.jours_dans_mois,
    joursEcoules: summary.jours_ecoules,
    joursRestants: summary.jours_restants,
    total: groupFromSummary(summary.total),
    regions: summary.regions.map(groupFromSummary),
    rows,
    lastImport: imp ? { fileName: imp.file_name, createdAt: imp.created_at } : null,
  };
}

export async function getZones(): Promise<Zone[]> {
  if (IS_DEMO) return demoZones();
  const supabase = await createClient();
  const { data, error } = await supabase.from("zones").select("id, name").order("sort_order");
  if (error) fail("régions", error);
  return data ?? [];
}

export async function getDistributors(): Promise<Distributor[]> {
  if (IS_DEMO) return demoDistributorList();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("distributors")
    .select("id, name, phone, raw_phone, city, zone_id, active, zones(name, sort_order)")
    .order("sort_order");
  if (error) fail("distributeurs", error);
  type Row = {
    id: string; name: string; phone: string | null; raw_phone: string | null; city: string;
    zone_id: string | null; active: boolean; zones: { name: string; sort_order: number } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .sort((a, b) => (a.zones?.sort_order ?? 999) - (b.zones?.sort_order ?? 999))
    .map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      rawPhone: d.raw_phone,
      city: d.city,
      zoneId: d.zone_id,
      zoneName: d.zones?.name ?? "Sans région",
      active: d.active,
    }));
}

export async function getImportHistory(limit = 20): Promise<ImportHistoryItem[]> {
  if (IS_DEMO) return demoImports();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, period_code, file_name, status, nb_distributors, nb_sales, issues, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("historique des imports", error);
  return (data ?? []).map((i) => ({
    id: i.id,
    period: i.period_code,
    fileName: i.file_name,
    status: i.status,
    nbDistributors: i.nb_distributors,
    nbSales: i.nb_sales,
    nbIssues: Array.isArray(i.issues) ? i.issues.length : 0,
    createdAt: i.created_at,
  }));
}

export async function getTtcRate(): Promise<number> {
  if (IS_DEMO) return DEFAULT_KPI_SETTINGS.ttcRate;
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "ttc_rate").maybeSingle();
  const rate = Number(data?.value);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_KPI_SETTINGS.ttcRate;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  if (IS_DEMO) return "demo@dpms";
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}
