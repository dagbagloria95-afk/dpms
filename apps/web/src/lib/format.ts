import { periodLabel } from "@dpms/core/lite";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** 1250000 -> "1 250 000" */
export function fcfa(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return nf.format(Math.round(n)).replace(/ | /g, " ");
}

/** 1250000 -> "1,25 M" (tuiles et graphiques) */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Md`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M`;
  if (abs >= 1e3) return `${(n / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k`;
  return fcfa(n);
}

export function pct(r: number | null | undefined): string {
  if (r === null || r === undefined) return "–";
  return `${Math.round(r * 100)} %`;
}

export function dateFr(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export { periodLabel };

export type PaceStatus = "done" | "good" | "warning" | "critical" | "none";

/**
 * En cours de mois, le taux seul ne dit pas si l'on est en retard :
 * on compare la projection fin de mois (rythme actuel) à l'objectif.
 */
export function paceStatus(k: {
  taux: number | null;
  projection: number;
  objectifTtc: number | null;
}): PaceStatus {
  if (k.taux === null || !k.objectifTtc) return "none";
  if (k.taux >= 1) return "done";
  const ratio = k.projection / k.objectifTtc;
  if (ratio >= 1) return "good";
  if (ratio >= 0.8) return "warning";
  return "critical";
}

export const PACE_LABEL: Record<PaceStatus, string> = {
  done: "Objectif atteint",
  good: "En bonne voie",
  warning: "À surveiller",
  critical: "En retard",
  none: "Sans objectif",
};
