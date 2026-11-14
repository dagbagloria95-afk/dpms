import type { CellValue } from "exceljs";

/**
 * Valeur "à plat" d'une cellule ExcelJS : on prend le résultat mis en cache
 * pour les formules, le texte pour le texte enrichi, etc.
 */
export function plainValue(v: CellValue | undefined): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v !== "object") return v;
  if ("result" in v) return plainValue(v.result as CellValue);
  if ("formula" in v || "sharedFormula" in v) return null; // formule sans résultat en cache
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return v.text; // lien hypertexte
  if ("error" in v) return { error: v.error };
  return null;
}

/** Texte nettoyé (espaces multiples réduits, bords supprimés). */
export function cellText(v: CellValue | undefined): string {
  const p = plainValue(v);
  if (p === null || p === undefined || typeof p === "object") return "";
  return String(p).replace(/\s+/g, " ").trim();
}

/** Comparaison insensible à la casse et aux accents. */
export function normalizeLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export type NumberResult =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "invalid"; raw: string };

/** Lit un montant : nombres, formules, texte "1 250 000" ou "1250,5". */
export function cellNumber(v: CellValue | undefined): NumberResult {
  const p = plainValue(v);
  if (p === null || p === undefined || p === "") return { kind: "empty" };
  if (typeof p === "number") {
    return Number.isFinite(p) ? { kind: "number", value: p } : { kind: "invalid", raw: String(p) };
  }
  if (typeof p === "string") {
    const t = p.replace(/[\s  ]/g, "").replace(",", ".");
    if (t === "" || t === "-") return { kind: "empty" };
    const n = Number(t);
    return Number.isFinite(n) ? { kind: "number", value: n } : { kind: "invalid", raw: p };
  }
  if (typeof p === "object" && p && "error" in p) {
    return { kind: "invalid", raw: String((p as { error: unknown }).error) };
  }
  return { kind: "invalid", raw: String(p) };
}

/** Convertit un numéro de série Excel (jours depuis 1899-12-30) en Date UTC. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
}
