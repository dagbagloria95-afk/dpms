import ExcelJS from "exceljs";
import type { Worksheet } from "exceljs";
import { periodFromSheetName, periodOf, toIsoDate } from "../dates";
import { normalizeCarPhone } from "../phone";
import type {
  DailySale,
  ImportIssue,
  ImportedDistributor,
  IsoDate,
  ParsedMonthlyWorkbook,
  Product,
  WeekBucket,
} from "../types";
import { cellNumber, cellText, excelSerialToDate, normalizeLabel, plainValue } from "./cell";

/**
 * Lecture du modèle mensuel de suivi (ex. feuille "NOVEMBRE 2025") :
 *
 *   ligne N-1 : dates du mois (cellules fusionnées sur 2 colonnes), "s1".."s4", "cumul…"
 *   ligne N   : DISTRIBUTEURS | STKA | VILLES | objectifs HT | objectifs TTC | zebra | DW | …
 *   lignes    : une ligne par distributeur, région en colonne A (fusionnée),
 *               lignes de sous-total (nom vide) et ligne TOTAL en fin de tableau.
 *
 * Les colonnes sont repérées par leurs libellés, pas par leur position :
 * ajouter un distributeur ou une colonne ne casse donc pas l'import.
 */

export interface ParseOptions {
  /** Nom de la feuille à lire. Par défaut : la première qui contient l'en-tête "DISTRIBUTEURS". */
  sheetName?: string;
}

export class WorkbookFormatError extends Error {}

export async function loadWorkbook(data: ArrayBuffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS attend un Buffer Node ou un ArrayBuffer selon l'environnement.
  const input = typeof Buffer !== "undefined" ? Buffer.from(data as ArrayBuffer) : data;
  await wb.xlsx.load(input as ArrayBuffer);
  return wb;
}

export async function parseMonthlyWorkbook(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions = {},
): Promise<ParsedMonthlyWorkbook> {
  const wb = await loadWorkbook(data);
  const sheets = options.sheetName
    ? wb.worksheets.filter((s) => s.name === options.sheetName)
    : wb.worksheets;
  if (sheets.length === 0) {
    throw new WorkbookFormatError(`Feuille "${options.sheetName}" introuvable.`);
  }
  for (const ws of sheets) {
    if (findHeaderRow(ws)) return parseSheet(ws);
  }
  throw new WorkbookFormatError(
    'Aucune feuille ne contient l\'en-tête "DISTRIBUTEURS". Vérifiez que le fichier suit le modèle mensuel.',
  );
}

/** Noms des feuilles qui ressemblent au modèle (pour proposer un choix à l'utilisateur). */
export async function listMonthlySheets(data: ArrayBuffer | Uint8Array): Promise<string[]> {
  const wb = await loadWorkbook(data);
  return wb.worksheets.filter((ws) => findHeaderRow(ws) !== null).map((ws) => ws.name);
}

interface HeaderInfo {
  row: number;
  nameCol: number;
}

function findHeaderRow(ws: Worksheet): HeaderInfo | null {
  const maxRow = Math.min(ws.rowCount, 30);
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(ws.columnCount, 20); c++) {
      if (normalizeLabel(cellText(row.getCell(c).value)) === "DISTRIBUTEURS") {
        return { row: r, nameCol: c };
      }
    }
  }
  return null;
}

function colLetter(c: number): string {
  let s = "";
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

function readHeaderDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number" && v > 30_000 && v < 80_000) return excelSerialToDate(v);
  return null;
}

function parseSheet(ws: Worksheet): ParsedMonthlyWorkbook {
  const issues: ImportIssue[] = [];
  const header = findHeaderRow(ws)!;
  const headerRow = ws.getRow(header.row);
  const dateRow = ws.getRow(header.row - 1);
  const colCount = ws.columnCount;

  // --- Colonnes d'identité et d'objectifs -----------------------------------
  let phoneCol: number | null = null;
  let cityCol: number | null = null;
  let objHtCol: number | null = null;
  let objTtcCol: number | null = null;
  for (let c = 1; c <= colCount; c++) {
    const label = normalizeLabel(cellText(headerRow.getCell(c).value));
    if (label === "STKA" || label.startsWith("TELEPHONE") || label === "NUMERO") phoneCol ??= c;
    else if (label.startsWith("VILLE")) cityCol ??= c;
    else if (label.includes("OBJECTIF") && label.includes("HT")) objHtCol ??= c;
    else if (label.includes("OBJECTIF") && label.includes("TTC")) objTtcCol ??= c;
  }
  if (phoneCol === null) {
    throw new WorkbookFormatError('Colonne "STKA" (numéro de téléphone) introuvable.');
  }
  const regionCol = header.nameCol > 1 ? header.nameCol - 1 : null;

  // --- Colonnes journalières et semaines -------------------------------------
  const productCols: { col: number; date: IsoDate; product: Product }[] = [];
  const weeks: WeekBucket[] = [];
  let pendingDates: IsoDate[] = [];
  let lastWeekLabel: string | null = null;

  for (let c = 1; c <= colCount; c++) {
    const label = normalizeLabel(cellText(headerRow.getCell(c).value));
    const product: Product | null = label === "ZEBRA" ? "zebra" : label === "DW" ? "dw" : null;
    if (!product) continue;

    // La date est dans la cellule fusionnée au-dessus (colonne c ou c-1).
    const above = plainValue(dateRow.getCell(c).value) ?? plainValue(dateRow.getCell(c - 1).value);
    const date = readHeaderDate(above);
    if (date) {
      const iso = toIsoDate(date);
      productCols.push({ col: c, date: iso, product });
      if (!pendingDates.includes(iso)) pendingDates.push(iso);
      continue;
    }
    const aboveText = normalizeLabel(typeof above === "string" ? above : "");
    const weekMatch = aboveText.match(/^S\s*(\d+)$/);
    if (weekMatch && lastWeekLabel !== aboveText) {
      lastWeekLabel = aboveText;
      if (pendingDates.length) weeks.push({ label: `s${weekMatch[1]}`, dates: pendingDates });
      pendingDates = [];
    }
    // Les colonnes "cumul" et les sous-totaux sont ignorés : on recalcule tout.
  }
  if (pendingDates.length) {
    weeks.push({ label: `s${weeks.length + 1}`, dates: pendingDates });
  }

  const dates = [...new Set(productCols.map((p) => p.date))].sort();
  if (dates.length === 0) {
    throw new WorkbookFormatError(
      "Aucune date trouvée au-dessus des colonnes zebra / DW. Vérifiez la ligne des dates.",
    );
  }

  // --- Période ---------------------------------------------------------------
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(periodOf(d), (counts.get(periodOf(d)) ?? 0) + 1);
  const period = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const fromName = periodFromSheetName(ws.name);
  if (fromName && fromName !== period) {
    issues.push({
      level: "warning",
      message: `Le nom de la feuille "${ws.name}" ne correspond pas aux dates du tableau (${period}).`,
    });
  }
  for (const d of dates) {
    if (periodOf(d) !== period) {
      issues.push({ level: "warning", message: `La date ${d} est hors de la période ${period} : ignorée.` });
    }
  }

  // --- Lignes distributeurs --------------------------------------------------
  const distributors: ImportedDistributor[] = [];
  const sales: DailySale[] = [];
  const phones = new Map<string, number>();
  let region = "";

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const regionText = regionCol ? cellText(row.getCell(regionCol).value) : "";
    if (normalizeLabel(regionText) === "TOTAL") break;
    if (regionText && regionText !== "0" && !/^\d+$/.test(regionText)) region = regionText;

    const name = cellText(row.getCell(header.nameCol).value);
    if (!name) continue; // ligne vide ou sous-total de région
    if (normalizeLabel(name) === "TOTAL") break;

    const rawPhone = cellText(row.getCell(phoneCol).value);
    const phone = normalizeCarPhone(rawPhone);
    if (!phone) {
      issues.push({
        level: "warning",
        row: r,
        column: colLetter(phoneCol),
        message: `${name} : numéro "${rawPhone || "vide"}" invalide (8 chiffres attendus). Aucun SMS ne pourra lui être envoyé.`,
      });
    } else if (phones.has(phone)) {
      issues.push({
        level: "error",
        row: r,
        column: colLetter(phoneCol),
        message: `${name} : le numéro ${rawPhone} est déjà utilisé ligne ${phones.get(phone)}.`,
      });
    } else {
      phones.set(phone, r);
    }

    const readObjective = (col: number | null): number | null => {
      if (col === null) return null;
      const n = cellNumber(row.getCell(col).value);
      if (n.kind === "invalid") {
        issues.push({ level: "warning", row: r, column: colLetter(col), message: `${name} : objectif "${n.raw}" illisible.` });
      }
      return n.kind === "number" && n.value > 0 ? n.value : null;
    };

    const index = distributors.length;
    distributors.push({
      row: r,
      region: region || "Sans région",
      name,
      rawPhone,
      phone,
      city: cityCol ? cellText(row.getCell(cityCol).value) : "",
      objectiveHt: readObjective(objHtCol),
      objectiveTtc: readObjective(objTtcCol),
    });

    for (const pc of productCols) {
      if (periodOf(pc.date) !== period) continue;
      const n = cellNumber(row.getCell(pc.col).value);
      if (n.kind === "invalid") {
        issues.push({
          level: "warning",
          row: r,
          column: colLetter(pc.col),
          message: `${name} : montant "${n.raw}" illisible le ${pc.date} (${pc.product}) : ignoré.`,
        });
        continue;
      }
      if (n.kind === "empty" || n.value === 0) continue;
      if (n.value < 0) {
        issues.push({
          level: "warning",
          row: r,
          column: colLetter(pc.col),
          message: `${name} : montant négatif (${n.value}) le ${pc.date} (${pc.product}).`,
        });
      }
      sales.push({ distributorIndex: index, date: pc.date, product: pc.product, amount: n.value });
    }
  }

  if (distributors.length === 0) {
    issues.push({ level: "error", message: "Aucun distributeur trouvé sous l'en-tête." });
  }

  return {
    sheetName: ws.name,
    period,
    dates: dates.filter((d) => periodOf(d) === period),
    weeks: weeks
      .map((w) => ({ ...w, dates: w.dates.filter((d) => periodOf(d) === period) }))
      .filter((w) => w.dates.length > 0),
    distributors,
    sales,
    issues,
  };
}
