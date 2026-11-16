"use server";

import {
  buildImportPayload,
  computePerformance,
  listMonthlySheets,
  parseMonthlyWorkbook,
  periodLabel,
  WorkbookFormatError,
  type ImportIssue,
  type ParsedMonthlyWorkbook,
  type PerformanceReport,
} from "@dpms/core";
import { revalidatePath } from "next/cache";
import { getTtcRate } from "@/lib/data";
import { IS_DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;

export interface ImportPreview {
  fileName: string;
  sheets: string[];
  sheetName: string;
  period: string;
  periodLabel: string;
  asOf: string | null;
  nbDays: number;
  nbSales: number;
  issues: ImportIssue[];
  hasErrors: boolean;
  /** Le mois existe déjà : la validation remplacera ses chiffres. */
  replacesExisting: boolean;
  newDistributors: number;
  total: { realiseTtc: number; objectifTtc: number | null; taux: number | null };
  regions: { label: string; nb: number; realiseTtc: number; taux: number | null }[];
  rows: {
    row: number;
    name: string;
    region: string;
    city: string;
    phone: string | null;
    rawPhone: string;
    objectifTtc: number | null;
    realiseTtc: number;
    taux: number | null;
  }[];
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function readFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserError("Choisissez un fichier Excel (.xlsx).");
  if (file.size > MAX_BYTES) throw new UserError("Fichier trop volumineux (10 Mo maximum).");
  if (!/\.xlsx$/i.test(file.name)) {
    throw new UserError("Format non pris en charge : enregistrez le fichier au format .xlsx (Excel 2007 ou plus récent).");
  }
  const sheetName = String(form.get("sheet") ?? "") || undefined;
  return { file, buffer: await file.arrayBuffer(), sheetName };
}

class UserError extends Error {}

async function analyse(form: FormData) {
  const { file, buffer, sheetName } = await readFile(form);
  const [sheets, parsed, ttcRate] = await Promise.all([
    listMonthlySheets(buffer),
    parseMonthlyWorkbook(buffer, { sheetName }),
    getTtcRate(),
  ]);
  const report = computePerformance(parsed, { ttcRate });
  return { file, buffer, sheets, parsed, report };
}

function toMessage(e: unknown): string {
  if (e instanceof UserError || e instanceof WorkbookFormatError) return e.message;
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (/zip|central directory|end of data/i.test(msg)) {
    return "Le fichier est illisible : vérifiez qu'il s'agit bien d'un classeur Excel .xlsx non protégé par mot de passe.";
  }
  return `Erreur inattendue : ${msg}`;
}

async function existingInfo(parsed: ParsedMonthlyWorkbook) {
  if (IS_DEMO) return { replacesExisting: parsed.period === "2025-11", newDistributors: 0 };
  const supabase = await createClient();
  const phones = parsed.distributors.map((d) => d.phone).filter((p): p is string => !!p);
  const [{ data: period }, { data: known }] = await Promise.all([
    supabase.from("periods").select("code").eq("code", parsed.period).maybeSingle(),
    supabase.from("distributors").select("phone").in("phone", phones),
  ]);
  const knownSet = new Set((known ?? []).map((k) => k.phone));
  return {
    replacesExisting: !!period,
    newDistributors: parsed.distributors.filter((d) => !d.phone || !knownSet.has(d.phone)).length,
  };
}

function buildPreview(
  fileName: string,
  sheets: string[],
  parsed: ParsedMonthlyWorkbook,
  report: PerformanceReport,
  extra: { replacesExisting: boolean; newDistributors: number },
): ImportPreview {
  return {
    fileName,
    sheets,
    sheetName: parsed.sheetName,
    period: parsed.period,
    periodLabel: periodLabel(parsed.period),
    asOf: report.asOf,
    nbDays: parsed.dates.length,
    nbSales: parsed.sales.length,
    issues: parsed.issues,
    hasErrors: parsed.issues.some((i) => i.level === "error"),
    ...extra,
    total: { realiseTtc: report.total.realiseTtc, objectifTtc: report.total.objectifTtc, taux: report.total.taux },
    regions: report.regions.map((r) => ({ label: r.label, nb: r.nbDistributeurs, realiseTtc: r.realiseTtc, taux: r.taux })),
    rows: parsed.distributors.map((d, i) => {
      const k = report.distributors[i]!;
      return {
        row: d.row,
        name: d.name,
        region: d.region,
        city: d.city,
        phone: d.phone,
        rawPhone: d.rawPhone,
        objectifTtc: k.objectifTtc,
        realiseTtc: k.realiseTtc,
        taux: k.taux,
      };
    }),
  };
}

/** Étape 1 : lecture et contrôle du fichier, sans rien enregistrer. */
export async function previewImport(form: FormData): Promise<Result<ImportPreview>> {
  try {
    const { file, sheets, parsed, report } = await analyse(form);
    return { ok: true, data: buildPreview(file.name, sheets, parsed, report, await existingInfo(parsed)) };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}

/** Étape 2 : enregistrement (fichier archivé + données en une transaction). */
export async function confirmImport(form: FormData): Promise<Result<{ period: string }>> {
  if (IS_DEMO) {
    return { ok: false, error: "Mode démonstration : l'enregistrement sera possible une fois la base de données connectée." };
  }
  try {
    const { file, buffer, parsed, report } = await analyse(form);
    if (parsed.issues.some((i) => i.level === "error")) {
      return { ok: false, error: "Le fichier contient des erreurs bloquantes : corrigez-les puis réimportez." };
    }
    const supabase = await createClient();
    const safeName = file.name.replace(/[^\w.-]+/g, "_");
    const storagePath = `${parsed.period}/${new Date().toISOString().replace(/[:.]/g, "-")}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("imports")
      .upload(storagePath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    if (upErr) return { ok: false, error: `Archivage du fichier impossible : ${upErr.message}` };

    const payload = buildImportPayload(parsed, report, { fileName: file.name, storagePath });
    const { error } = await supabase.rpc("apply_monthly_import", { p: payload });
    if (error) {
      await supabase.storage.from("imports").remove([storagePath]);
      return { ok: false, error: `Enregistrement refusé : ${error.message}` };
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { period: parsed.period } };
  } catch (e) {
    return { ok: false, error: toMessage(e) };
  }
}
