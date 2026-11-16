"use client";

import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { fcfa, paceStatus, PACE_LABEL, pct } from "@/lib/format";
import type { PerformanceRow } from "@/lib/types";
import { PaceBadge } from "./PaceBadge";
import { RateMeter } from "./RateMeter";

type SortKey = "rang" | "name" | "realiseTtc" | "objectifTtc" | "taux" | "raf" | "objectifJournalier";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "rang", label: "Rang", numeric: true },
  { key: "name", label: "Distributeur" },
  { key: "realiseTtc", label: "Réalisé TTC", numeric: true },
  { key: "objectifTtc", label: "Objectif TTC", numeric: true },
  { key: "taux", label: "Taux", numeric: true },
  { key: "raf", label: "Reste à faire", numeric: true },
  { key: "objectifJournalier", label: "Obj. / jour", numeric: true },
];

export function RankingTable({
  rows,
  regions,
  timeShare,
  period,
}: {
  rows: PerformanceRow[];
  regions: string[];
  timeShare: number;
  period: string;
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rang", dir: 1 });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!region || r.region === region) &&
        (!q || r.name.toLowerCase().includes(q) || r.city.toLowerCase().includes(q) || (r.phone ?? "").includes(q)),
    );
    return [...list].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      // Les valeurs vides (sans objectif) restent toujours en bas.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string") return va.localeCompare(vb as string, "fr") * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
  }, [rows, query, region, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "rang" || key === "name" ? 1 : -1 }));

  const exportCsv = () => {
    const head = ["Rang", "Rang région", "Distributeur", "Région", "Ville", "Téléphone", "Réalisé zebra", "Réalisé DW",
      "Réalisé TTC", "Objectif HT", "Objectif TTC", "Taux %", "Reste à faire", "Moyenne / jour", "Objectif / jour",
      "Projection fin de mois", "Statut"];
    const lines = visible.map((r) => [
      r.rang ?? "", r.rangRegion ?? "", r.name, r.region, r.city, r.phone ?? "", r.realiseZebra, r.realiseDw,
      r.realiseTtc, r.objectifHt ?? "", r.objectifTtc ?? "", r.taux === null ? "" : Math.round(r.taux * 1000) / 10,
      r.raf ?? "", Math.round(r.moyenneJournaliere), r.objectifJournalier === null ? "" : Math.round(r.objectifJournalier),
      Math.round(r.projection), PACE_LABEL[paceStatus(r)],
    ]);
    const csv = [head, ...lines]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `performances-${period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card">
      <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-9"
            placeholder="Rechercher un distributeur, une ville, un numéro…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher"
          />
        </div>
        <select className="input sm:w-52" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filtrer par région">
          <option value="">Toutes les régions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="button" onClick={exportCsv} className="btn-ghost">
          <Download size={16} aria-hidden /> Exporter
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`th ${c.numeric ? "text-right" : ""}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-1 hover:text-ink ${c.numeric ? "flex-row-reverse" : ""}`}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
              <th className="th">Statut</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.distributorId} className="border-b border-line/70 last:border-0 hover:bg-surface-2/50">
                <td className="td tabular text-right text-ink-2">{r.rang ?? "–"}</td>
                <td className="td">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted">{r.region} · {r.city}</div>
                </td>
                <td className="td tabular text-right">{fcfa(r.realiseTtc)}</td>
                <td className="td tabular text-right text-ink-2">{fcfa(r.objectifTtc)}</td>
                <td className="td"><div className="flex justify-end"><RateMeter taux={r.taux} timeShare={timeShare} /></div></td>
                <td className="td tabular text-right">{fcfa(r.raf)}</td>
                <td className="td tabular text-right">{fcfa(r.objectifJournalier)}</td>
                <td className="td"><PaceBadge status={paceStatus(r)} /></td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={8} className="td py-8 text-center text-muted">Aucun distributeur ne correspond à la recherche.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-3 py-2 text-xs text-muted">
        {visible.length} distributeur{visible.length > 1 ? "s" : ""} · taux moyen affiché : {pct(avg(visible.map((r) => r.taux)))}
      </div>
    </div>
  );
}

function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
