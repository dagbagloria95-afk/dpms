import { periodLabel } from "../dates";
import type { DistributorPerformance, PerformanceReport } from "../types";

/** Variables disponibles dans les modèles de SMS : {{nom}}, {{taux}}… */
export const SMS_VARIABLES = {
  nom: "Nom du distributeur",
  region: "Région",
  ville: "Ville",
  periode: "Mois (ex. Novembre 2025)",
  date_arrete: "Date d'arrêté des chiffres (ex. 14/11/2025)",
  realise: "Réalisé TTC",
  realise_zebra: "Réalisé zebra",
  realise_dw: "Réalisé DW",
  objectif: "Objectif TTC",
  objectif_ht: "Objectif HT",
  taux: "Taux de réalisation (ex. 85%)",
  raf: "Reste à faire",
  objectif_journalier: "Objectif journalier pour finir le mois",
  moyenne_journaliere: "Moyenne journalière réalisée",
  projection: "Projection fin de mois",
  rang: "Rang national",
  rang_region: "Rang dans la région",
  nb_distributeurs: "Nombre total de distributeurs classés",
  jours_restants: "Jours restants dans le mois",
} as const;

export type SmsVariable = keyof typeof SMS_VARIABLES;
export type SmsContext = Record<SmsVariable, string>;

/** 1250000 -> "1 250 000" (espace simple : compatible SMS GSM). */
export function formatAmount(n: number | null): string {
  if (n === null) return "-";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 0.8537 -> "85%"; 1.0 -> "100%" */
export function formatRate(r: number | null): string {
  return r === null ? "-" : `${Math.round(r * 100)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function buildSmsContext(
  report: PerformanceReport,
  perf: DistributorPerformance,
  extra: { city?: string } = {},
): SmsContext {
  const ranked = report.distributors.filter((d) => d.rang !== null).length;
  return {
    nom: perf.name,
    region: perf.region,
    ville: extra.city ?? "",
    periode: periodLabel(report.period),
    date_arrete: formatDate(report.asOf),
    realise: formatAmount(perf.realiseTtc),
    realise_zebra: formatAmount(perf.realiseZebra),
    realise_dw: formatAmount(perf.realiseDw),
    objectif: formatAmount(perf.objectifTtc),
    objectif_ht: formatAmount(perf.objectifHt),
    taux: formatRate(perf.taux),
    raf: formatAmount(perf.raf),
    objectif_journalier: formatAmount(perf.objectifJournalier),
    moyenne_journaliere: formatAmount(perf.moyenneJournaliere),
    projection: formatAmount(perf.projectionFinMois),
    rang: perf.rang === null ? "-" : String(perf.rang),
    rang_region: perf.rangRegion === null ? "-" : String(perf.rangRegion),
    nb_distributeurs: String(ranked),
    jours_restants: String(report.joursRestants),
  };
}

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Variables inconnues utilisées dans un modèle (pour avertir l'administrateur). */
export function unknownVariables(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    if (!(m[1]! in SMS_VARIABLES)) out.add(m[1]!);
  }
  return [...out];
}

export function renderSmsTemplate(template: string, ctx: Partial<SmsContext>): string {
  return template.replace(VAR_RE, (whole, name: string) =>
    name in SMS_VARIABLES ? (ctx[name as SmsVariable] ?? "") : whole,
  );
}
