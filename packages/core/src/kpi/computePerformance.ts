import { dayOfMonth, daysInMonth } from "../dates";
import {
  DEFAULT_KPI_SETTINGS,
  type DailySale,
  type DistributorPerformance,
  type GroupPerformance,
  type IsoDate,
  type KpiSettings,
  type KpiValues,
  type PerformanceReport,
  type PeriodCode,
  type WeekBucket,
} from "../types";

export interface PerformanceInput {
  period: PeriodCode;
  weeks: WeekBucket[];
  distributors: { name: string; region: string; objectiveHt: number | null; objectiveTtc: number | null }[];
  sales: DailySale[];
  /**
   * Date d'arrêté. Par défaut : dernier jour du mois contenant au moins une vente.
   * Sert à calculer la moyenne journalière et l'objectif journalier.
   */
  asOf?: IsoDate | null;
}

/** Les montants journaliers du modèle sont en TTC (colonnes "cumul TTC"). */
export function objectiveTtc(
  d: { objectiveHt: number | null; objectiveTtc: number | null },
  settings: KpiSettings,
): number | null {
  if (d.objectiveTtc !== null && d.objectiveTtc > 0) return d.objectiveTtc;
  if (d.objectiveHt !== null && d.objectiveHt > 0) return round2(d.objectiveHt * settings.ttcRate);
  return null;
}

export function objectiveHt(
  d: { objectiveHt: number | null; objectiveTtc: number | null },
  settings: KpiSettings,
): number | null {
  if (d.objectiveHt !== null && d.objectiveHt > 0) return d.objectiveHt;
  if (d.objectiveTtc !== null && d.objectiveTtc > 0) return round2(d.objectiveTtc / settings.ttcRate);
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computePerformance(
  input: PerformanceInput,
  settings: KpiSettings = DEFAULT_KPI_SETTINGS,
): PerformanceReport {
  const nbDays = daysInMonth(input.period);
  const inPeriod = input.sales.filter((s) => s.date.startsWith(input.period));
  const asOf =
    input.asOf ??
    (inPeriod.length ? inPeriod.reduce((max, s) => (s.date > max ? s.date : max), inPeriod[0]!.date) : null);
  const joursEcoules = asOf ? dayOfMonth(asOf) : 0;
  const joursRestants = nbDays - joursEcoules;
  const counted = asOf ? inPeriod.filter((s) => s.date <= asOf) : [];

  const ctx = { joursEcoules, joursRestants, nbDays, weeks: input.weeks };

  const distributors: DistributorPerformance[] = input.distributors.map((d, i) => {
    const own = counted.filter((s) => s.distributorIndex === i);
    const kpi = buildKpi(own, objectiveHt(d, settings), objectiveTtc(d, settings), ctx);
    return { ...kpi, distributorIndex: i, name: d.name, region: d.region, rang: null, rangRegion: null };
  });

  assignRanks(distributors, "rang");
  const regionNames = [...new Set(distributors.map((d) => d.region))];
  for (const region of regionNames) {
    assignRanks(distributors.filter((d) => d.region === region), "rangRegion");
  }

  const group = (label: string, members: DistributorPerformance[]): GroupPerformance => {
    const idx = new Set(members.map((m) => m.distributorIndex));
    const sumObj = (k: "objectifHt" | "objectifTtc") => {
      const vals = members.map((m) => m[k]).filter((v): v is number => v !== null);
      return vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
    };
    const kpi = buildKpi(
      counted.filter((s) => idx.has(s.distributorIndex)),
      sumObj("objectifHt"),
      sumObj("objectifTtc"),
      ctx,
    );
    return { ...kpi, label, nbDistributeurs: members.length };
  };

  return {
    period: input.period,
    asOf,
    joursDansMois: nbDays,
    joursEcoules,
    joursRestants,
    distributors,
    regions: regionNames.map((r) => group(r, distributors.filter((d) => d.region === r))),
    total: group("TOTAL", distributors),
  };
}

function buildKpi(
  sales: DailySale[],
  objectifHt: number | null,
  objectifTtc: number | null,
  ctx: { joursEcoules: number; joursRestants: number; nbDays: number; weeks: WeekBucket[] },
): KpiValues {
  let realiseZebra = 0;
  let realiseDw = 0;
  for (const s of sales) {
    if (s.product === "zebra") realiseZebra += s.amount;
    else realiseDw += s.amount;
  }
  const realiseTtc = realiseZebra + realiseDw;
  const raf = objectifTtc !== null ? Math.max(objectifTtc - realiseTtc, 0) : null;
  const moyenne = ctx.joursEcoules > 0 ? realiseTtc / ctx.joursEcoules : 0;

  return {
    realiseZebra: round2(realiseZebra),
    realiseDw: round2(realiseDw),
    realiseTtc: round2(realiseTtc),
    objectifHt,
    objectifTtc,
    taux: objectifTtc ? realiseTtc / objectifTtc : null,
    raf: raf === null ? null : round2(raf),
    moyenneJournaliere: round2(moyenne),
    objectifJournalier: raf !== null && ctx.joursRestants > 0 ? round2(raf / ctx.joursRestants) : null,
    projectionFinMois: round2(moyenne * ctx.nbDays),
    semaines: ctx.weeks.map((w) => {
      const set = new Set(w.dates);
      let zebra = 0;
      let dw = 0;
      for (const s of sales) {
        if (!set.has(s.date)) continue;
        if (s.product === "zebra") zebra += s.amount;
        else dw += s.amount;
      }
      return { label: w.label, realise: round2(zebra + dw), zebra: round2(zebra), dw: round2(dw) };
    }),
  };
}

/** Classement par taux décroissant (ex æquo = même rang), puis par réalisé. */
function assignRanks(list: DistributorPerformance[], key: "rang" | "rangRegion"): void {
  const ranked = list
    .filter((d) => d.taux !== null)
    .sort((a, b) => b.taux! - a.taux! || b.realiseTtc - a.realiseTtc);
  let prev: DistributorPerformance | null = null;
  ranked.forEach((d, i) => {
    d[key] =
      prev && prev.taux === d.taux && prev.realiseTtc === d.realiseTtc ? prev[key] : i + 1;
    prev = d;
  });
}
