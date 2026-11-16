"use client";

import { useState } from "react";
import { fcfa, pct } from "@/lib/format";
import type { GroupRow } from "@/lib/types";

/**
 * Taux de réalisation par région (une seule série → pas de légende).
 * Barres horizontales, repère 100 %, repère "part du mois écoulée".
 */
export function RegionChart({ regions, timeShare }: { regions: GroupRow[]; timeShare: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1.2, ...regions.map((r) => r.taux ?? 0));
  const x = (v: number) => `${(v / max) * 100}%`;

  return (
    <div>
      <div className="space-y-3">
        {regions.map((r) => {
          const active = hover === r.label;
          return (
            <div
              key={r.label}
              className="group relative grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 sm:grid-cols-[9rem_1fr_3.5rem]"
              onMouseEnter={() => setHover(r.label)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.label)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <div className="truncate text-sm text-ink-2" title={r.label}>{r.label}</div>
              <div className="relative h-6">
                <div className="absolute inset-y-0 left-0 right-0 rounded bg-surface-2/60" />
                <div
                  className={`absolute inset-y-1 left-0 rounded-r bg-accent transition-opacity ${hover && !active ? "opacity-40" : ""}`}
                  style={{ width: x(Math.min(r.taux ?? 0, max)) }}
                />
                <div className="absolute -inset-y-0.5 w-0.5 bg-ink-2" style={{ left: x(1) }} aria-hidden />
                {timeShare < 1 && (
                  <div className="absolute -inset-y-0.5 w-px border-l border-dashed border-muted" style={{ left: x(timeShare) }} aria-hidden />
                )}
                {active && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
                  >
                    <div className="mb-1 font-medium text-ink">{r.label} · {r.nbDistributeurs} distributeurs</div>
                    <Row k="Réalisé TTC" v={`${fcfa(r.realiseTtc)} FCFA`} />
                    <Row k="Objectif TTC" v={`${fcfa(r.objectifTtc)} FCFA`} />
                    <Row k="Taux" v={pct(r.taux)} />
                    <Row k="Reste à faire" v={`${fcfa(r.raf)} FCFA`} />
                    <Row k="Projection fin de mois" v={`${fcfa(r.projection)} FCFA`} />
                  </div>
                )}
              </div>
              <div className="tabular text-right text-sm font-medium">{pct(r.taux)}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-ink-2" /> Objectif (100 %)</span>
        {timeShare < 1 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 border-l border-dashed border-muted" /> Part du mois écoulée ({pct(timeShare)})
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-ink-2">{k}</span>
      <span className="tabular text-ink">{v}</span>
    </div>
  );
}
