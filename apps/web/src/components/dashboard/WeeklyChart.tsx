"use client";

import { useState } from "react";
import { compact, fcfa } from "@/lib/format";

export interface WeekPoint {
  label: string;
  zebra: number;
  dw: number;
}

/**
 * Réalisé par semaine, empilé zebra / DW (2 séries : légende + étiquettes directes).
 * Les séries gardent toujours la même couleur : zebra = série 1, DW = série 2.
 */
export function WeeklyChart({ weeks }: { weeks: WeekPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.zebra + w.dw));
  const H = 180;

  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-ink-2" aria-label="Légende">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-zebra" /> zebra</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-dw" /> DW</span>
      </div>
      <div className="relative flex items-end gap-3 border-b border-line sm:gap-6" style={{ height: H + 24 }}>
        {weeks.map((w, i) => {
          const total = w.zebra + w.dw;
          const hz = (w.zebra / max) * H;
          const hd = (w.dw / max) * H;
          const dim = hover !== null && hover !== i;
          return (
            <div
              key={w.label}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <div className="tabular mb-1 text-xs text-ink-2">{total > 0 ? compact(total) : ""}</div>
              <div className={`flex w-full max-w-16 flex-col transition-opacity ${dim ? "opacity-40" : ""}`}>
                {hd > 0 && <div className="rounded-t bg-dw" style={{ height: hd }} />}
                {hd > 0 && hz > 0 && <div className="h-0.5 bg-surface" />}
                {hz > 0 && <div className={`bg-zebra ${hd > 0 ? "" : "rounded-t"}`} style={{ height: hz }} />}
              </div>
              {hover === i && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full z-10 mb-1 w-52 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
                >
                  <div className="mb-1 font-medium uppercase text-ink">Semaine {w.label}</div>
                  <div className="flex justify-between py-0.5"><span className="flex items-center gap-1.5 text-ink-2"><span className="h-2 w-2 rounded-sm bg-zebra" />zebra</span><span className="tabular">{fcfa(w.zebra)}</span></div>
                  <div className="flex justify-between py-0.5"><span className="flex items-center gap-1.5 text-ink-2"><span className="h-2 w-2 rounded-sm bg-dw" />DW</span><span className="tabular">{fcfa(w.dw)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium"><span>Total TTC</span><span className="tabular">{fcfa(total)}</span></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-3 sm:gap-6">
        {weeks.map((w) => (
          <div key={w.label} className="flex-1 text-center text-xs uppercase text-muted">{w.label}</div>
        ))}
      </div>
    </div>
  );
}
