"use client";

import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { compact, dateFr, fcfa, pct } from "@/lib/format";
import { confirmImport, previewImport, type ImportPreview } from "./actions";

type State =
  | { step: "idle" }
  | { step: "preview"; preview: ImportPreview }
  | { step: "done"; period: string };

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const form = (f: File, sheet?: string) => {
    const fd = new FormData();
    fd.set("file", f);
    if (sheet) fd.set("sheet", sheet);
    return fd;
  };

  const analyse = (f: File, sheet?: string) => {
    setFile(f);
    setError(null);
    start(async () => {
      const res = await previewImport(form(f, sheet));
      if (res.ok) setState({ step: "preview", preview: res.data });
      else {
        setState({ step: "idle" });
        setError(res.error);
      }
    });
  };

  const confirm = () => {
    if (!file || state.step !== "preview") return;
    setError(null);
    start(async () => {
      const res = await confirmImport(form(file, state.preview.sheetName));
      if (res.ok) setState({ step: "done", period: res.data.period });
      else setError(res.error);
    });
  };

  const reset = () => {
    setFile(null);
    setState({ step: "idle" });
    setError(null);
    if (input.current) input.current.value = "";
  };

  if (state.step === "done") {
    return (
      <div className="card p-8 text-center">
        <CheckCircle2 className="mx-auto text-good" size={40} aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Import enregistré</h2>
        <p className="mt-1 text-sm text-ink-2">Les performances ont été recalculées.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={`/?periode=${state.period}`} className="btn-primary">Voir le tableau de bord</Link>
          <button type="button" onClick={reset} className="btn-ghost">Importer un autre fichier</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) analyse(f);
        }}
        className={`card flex flex-col items-center justify-center border-2 border-dashed p-8 text-center transition ${
          drag ? "border-accent bg-accent/5" : "border-line"
        }`}
      >
        {pending && state.step === "idle" ? (
          <Loader2 className="animate-spin text-accent" size={32} aria-hidden />
        ) : (
          <FileSpreadsheet className="text-muted" size={32} aria-hidden />
        )}
        <p className="mt-3 text-sm">
          {file ? <strong>{file.name}</strong> : "Glissez votre fichier Excel ici"}
        </p>
        <p className="mt-1 text-xs text-muted">Modèle mensuel habituel, format .xlsx, 10 Mo maximum</p>
        <label className="btn-ghost mt-4 cursor-pointer">
          <Upload size={16} aria-hidden /> Choisir un fichier
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analyse(f);
            }}
          />
        </label>
      </div>

      {error && (
        <div role="alert" className="flex gap-2 rounded-lg border border-critical/40 bg-critical/10 p-3 text-sm">
          <XCircle size={18} className="mt-0.5 shrink-0 text-critical" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {state.step === "preview" && (
        <Preview
          p={state.preview}
          pending={pending}
          onConfirm={confirm}
          onCancel={reset}
          onSheet={(s) => file && analyse(file, s)}
        />
      )}
    </div>
  );
}

function Preview({
  p,
  pending,
  onConfirm,
  onCancel,
  onSheet,
}: {
  p: ImportPreview;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSheet: (s: string) => void;
}) {
  const errors = p.issues.filter((i) => i.level === "error");
  const warnings = p.issues.filter((i) => i.level === "warning");

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Aperçu : {p.periodLabel}</h2>
            <p className="mt-1 text-sm text-ink-2">
              Feuille « {p.sheetName} » · {p.rows.length} distributeurs · {p.nbSales} montants journaliers
              {p.asOf ? <> · chiffres jusqu&apos;au {dateFr(p.asOf)}</> : <> · aucun montant saisi</>}
            </p>
          </div>
          {p.sheets.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-2">Feuille</span>
              <select className="input w-auto py-1.5" value={p.sheetName} onChange={(e) => onSheet(e.target.value)}>
                {p.sheets.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact k="Réalisé TTC" v={`${compact(p.total.realiseTtc)} FCFA`} />
          <Fact k="Objectif TTC" v={p.total.objectifTtc === null ? "Non renseigné" : `${compact(p.total.objectifTtc)} FCFA`} />
          <Fact k="Taux global" v={pct(p.total.taux)} />
          <Fact k="Nouveaux distributeurs" v={String(p.newDistributors)} />
        </dl>

        {p.replacesExisting && (
          <p className="mt-4 flex gap-2 rounded-lg border border-warning/50 bg-warning/15 p-3 text-sm">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            Des chiffres existent déjà pour {p.periodLabel} : ils seront <strong>remplacés</strong> par ceux de ce fichier.
          </p>
        )}
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="card p-4 sm:p-5">
          <h3 className="font-semibold">Contrôles</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {[...errors, ...warnings].map((i, n) => (
              <li key={n} className="flex gap-2">
                {i.level === "error" ? (
                  <XCircle size={16} className="mt-0.5 shrink-0 text-critical" aria-label="Erreur" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-label="Avertissement" />
                )}
                <span>
                  {i.row && <span className="text-muted">Ligne {i.row}{i.column ? `, colonne ${i.column}` : ""} : </span>}
                  {i.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Ligne</th>
                <th className="th">Distributeur</th>
                <th className="th">Région</th>
                <th className="th">Téléphone</th>
                <th className="th text-right">Objectif TTC</th>
                <th className="th text-right">Réalisé TTC</th>
                <th className="th text-right">Taux</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r) => (
                <tr key={r.row} className="border-b border-line/70 last:border-0">
                  <td className="td tabular text-muted">{r.row}</td>
                  <td className="td"><div className="font-medium">{r.name}</div><div className="text-xs text-muted">{r.city}</div></td>
                  <td className="td text-ink-2">{r.region}</td>
                  <td className="td tabular">
                    {r.phone ?? <span className="inline-flex items-center gap-1 text-critical"><XCircle size={14} aria-hidden /> {r.rawPhone || "vide"}</span>}
                  </td>
                  <td className="td tabular text-right">{fcfa(r.objectifTtc)}</td>
                  <td className="td tabular text-right">{fcfa(r.realiseTtc)}</td>
                  <td className="td tabular text-right">{pct(r.taux)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-line bg-page/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end md:-mx-8 md:px-8">
        <button type="button" onClick={onCancel} className="btn-ghost" disabled={pending}>Annuler</button>
        <button type="button" onClick={onConfirm} className="btn-primary" disabled={pending || p.hasErrors}>
          {pending ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Enregistrement…</> : "Valider et enregistrer"}
        </button>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-surface-2/60 p-3">
      <dt className="text-xs text-ink-2">{k}</dt>
      <dd className="tabular mt-0.5 font-semibold">{v}</dd>
    </div>
  );
}
