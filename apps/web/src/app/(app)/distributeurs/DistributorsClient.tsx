"use client";

import { formatCarPhone } from "@dpms/core/lite";
import { Pencil, Plus, Search, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import type { Distributor, Zone } from "@/lib/types";
import { createZone, saveDistributor, setDistributorActive } from "./actions";

export function DistributorsClient({ distributors, zones }: { distributors: Distributor[]; zones: Zone[] }) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<Distributor | "new" | null>(null);
  const [zoneForm, setZoneForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return distributors.filter(
      (d) =>
        (showInactive || d.active) &&
        (!q || d.name.toLowerCase().includes(q) || d.city.toLowerCase().includes(q) || (d.phone ?? "").includes(q.replace(/\s/g, ""))),
    );
  }, [distributors, query, showInactive]);

  const groups = useMemo(() => {
    const map = new Map<string, Distributor[]>();
    for (const d of filtered) map.set(d.zoneName, [...(map.get(d.zoneName) ?? []), d]);
    return [...map.entries()];
  }, [filtered]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) onOk?.();
      else setError(res.error ?? "Erreur");
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Afficher les inactifs
        </label>
        <button type="button" className="btn-ghost" onClick={() => setZoneForm(true)}>
          <Plus size={16} aria-hidden /> Région
        </button>
        <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden /> Distributeur
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-critical/40 bg-critical/10 p-3 text-sm">{error}</p>}

      {groups.map(([zone, list]) => (
        <section key={zone} className="card">
          <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm font-semibold">
            {zone}
            <span className="text-xs font-normal text-muted">{list.length}</span>
          </h2>
          <ul>
            {list.map((d) => (
              <li key={d.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line/70 px-4 py-2.5 last:border-0 ${d.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <div className="truncate text-sm font-medium">{d.name}</div>
                  <div className="text-xs text-muted">{d.city || "–"}</div>
                </div>
                <div className="tabular text-sm sm:w-36">
                  {d.phone ? formatCarPhone(d.phone) : <span className="text-critical">Numéro invalide</span>}
                </div>
                <label className="flex items-center gap-2 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    checked={d.active}
                    disabled={pending}
                    onChange={(e) => run(() => setDistributorActive(d.id, e.target.checked))}
                  />
                  Actif (reçoit les SMS)
                </label>
                <button type="button" className="ml-auto rounded-lg p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => setEditing(d)} aria-label={`Modifier ${d.name}`}>
                  <Pencil size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 && (
        <p className="card p-8 text-center text-sm text-muted">
          Aucun distributeur. Ils sont créés automatiquement au premier import Excel, ou manuellement avec le bouton « Distributeur ».
        </p>
      )}

      {editing && (
        <Dialog title={editing === "new" ? "Nouveau distributeur" : "Modifier le distributeur"} onClose={() => setEditing(null)}>
          <form
            action={(fd) => run(() => saveDistributor(fd), () => setEditing(null))}
            className="space-y-3"
          >
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Nom" name="name" defaultValue={editing === "new" ? "" : editing.name} required />
            <Field
              label="Téléphone (STKA)"
              name="phone"
              defaultValue={editing === "new" ? "" : (editing.phone?.replace(/^\+236/, "") ?? editing.rawPhone ?? "")}
              placeholder="72 18 80 81"
              inputMode="tel"
              required
            />
            <Field label="Ville" name="city" defaultValue={editing === "new" ? "" : editing.city} />
            <div>
              <label className="label" htmlFor="zoneId">Région</label>
              <select id="zoneId" name="zoneId" className="input" defaultValue={editing === "new" ? zones[0]?.id : (editing.zoneId ?? "")}>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            {error && <p role="alert" className="text-sm text-critical">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
              <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </Dialog>
      )}

      {zoneForm && (
        <Dialog title="Nouvelle région" onClose={() => setZoneForm(false)}>
          <form action={(fd) => run(() => createZone(fd), () => setZoneForm(false))} className="space-y-3">
            <Field label="Nom de la région" name="name" required />
            {error && <p role="alert" className="text-sm text-critical">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setZoneForm(false)}>Annuler</button>
              <button type="submit" className="btn-primary" disabled={pending}>Créer</button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, name, ...rest }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" {...rest} />
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-2 hover:bg-surface-2" aria-label="Fermer"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
