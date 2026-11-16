import { pct } from "@/lib/format";

/** Jauge du taux de réalisation : échelle 0–120 %, repère à 100 %. */
export function RateMeter({ taux, timeShare }: { taux: number | null; timeShare?: number }) {
  if (taux === null) return <span className="text-muted">–</span>;
  const MAX = 1.2;
  const w = Math.min(taux, MAX) / MAX;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 rounded-full bg-surface-2" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${w * 100}%` }} />
        {/* repère 100 % */}
        <div className="absolute -inset-y-0.5 w-0.5 rounded bg-ink-2" style={{ left: `${(1 / MAX) * 100}%` }} />
        {/* part du mois écoulée : où l'on "devrait" être */}
        {timeShare !== undefined && timeShare < 1 && (
          <div
            className="absolute -inset-y-0.5 w-0.5 rounded bg-muted"
            style={{ left: `${(timeShare / MAX) * 100}%` }}
            title="Part du mois écoulée"
          />
        )}
      </div>
      <span className="tabular w-11 text-right text-sm">{pct(taux)}</span>
    </div>
  );
}
