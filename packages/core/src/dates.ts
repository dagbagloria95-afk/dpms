import type { IsoDate, PeriodCode } from "./types.js";

const FR_MONTHS = [
  "JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE",
];

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Convertit une date Excel en date ISO.
 * ExcelJS renvoie des dates à minuit UTC : on lit donc les composantes UTC
 * pour ne pas décaler d'un jour selon le fuseau horaire du serveur.
 */
export function toIsoDate(d: Date): IsoDate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function periodOf(date: IsoDate): PeriodCode {
  return date.slice(0, 7);
}

export function daysInMonth(period: PeriodCode): number {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayOfMonth(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

/** "2025-11" -> "Novembre 2025" */
export function periodLabel(period: PeriodCode): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return `${FR_MONTH_LABELS[m - 1] ?? ""} ${y}`;
}

const FR_MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Devine la période depuis un nom de feuille comme "NOVEMBRE 2025". */
export function periodFromSheetName(name: string): PeriodCode | null {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  const year = clean.match(/(20\d{2})/)?.[1];
  const monthIdx = FR_MONTHS.findIndex((m) => clean.includes(m));
  if (!year || monthIdx < 0) return null;
  return `${year}-${pad(monthIdx + 1)}`;
}
