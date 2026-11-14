import type { ParsedMonthlyWorkbook, PerformanceReport } from "./types.js";

/**
 * Prépare l'argument de la fonction SQL `apply_monthly_import(p jsonb)`
 * à partir du fichier lu et des indicateurs calculés.
 */
export function buildImportPayload(
  parsed: ParsedMonthlyWorkbook,
  report: PerformanceReport,
  meta: { fileName: string; storagePath?: string | null },
) {
  return {
    period: parsed.period,
    sheet_name: parsed.sheetName,
    file_name: meta.fileName,
    storage_path: meta.storagePath ?? null,
    weeks: parsed.weeks,
    as_of: report.asOf,
    issues: parsed.issues,
    summary: {
      jours_dans_mois: report.joursDansMois,
      jours_ecoules: report.joursEcoules,
      jours_restants: report.joursRestants,
      regions: report.regions,
      total: report.total,
    },
    distributors: parsed.distributors.map((d, i) => {
      const k = report.distributors[i]!;
      return {
        region: d.region,
        name: d.name,
        phone: d.phone,
        raw_phone: d.rawPhone,
        city: d.city,
        objective_ht: k.objectifHt,
        objective_ttc: k.objectifTtc,
        perf: {
          realise_zebra: k.realiseZebra,
          realise_dw: k.realiseDw,
          realise_ttc: k.realiseTtc,
          objectif_ht: k.objectifHt,
          objectif_ttc: k.objectifTtc,
          taux: k.taux,
          raf: k.raf,
          moyenne_journaliere: k.moyenneJournaliere,
          objectif_journalier: k.objectifJournalier,
          projection: k.projectionFinMois,
          rang: k.rang,
          rang_region: k.rangRegion,
          semaines: k.semaines,
        },
      };
    }),
    sales: parsed.sales.map((s) => ({
      d: s.distributorIndex,
      date: s.date,
      product: s.product,
      amount: s.amount,
    })),
  };
}

export type ImportPayload = ReturnType<typeof buildImportPayload>;
