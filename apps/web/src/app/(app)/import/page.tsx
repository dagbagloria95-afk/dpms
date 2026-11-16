import { getImportHistory } from "@/lib/data";
import { periodLabel } from "@/lib/format";
import { ImportClient } from "./ImportClient";

export const metadata = { title: "Import Excel" };

const STATUS: Record<string, string> = {
  applied: "En vigueur",
  superseded: "Remplacé",
  failed: "Échec",
};

export default async function ImportPage() {
  const history = await getImportHistory();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Import Excel</h1>
        <p className="mt-1 text-sm text-ink-2">
          Importez le tableau mensuel. Vous verrez un aperçu et les contrôles <strong>avant</strong> tout enregistrement.
          Réimporter un mois remplace ses chiffres.
        </p>
      </header>

      <ImportClient />

      <section>
        <h2 className="mb-3 font-semibold">Historique des imports</h2>
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Date</th>
                <th className="th">Mois</th>
                <th className="th">Fichier</th>
                <th className="th text-right">Distributeurs</th>
                <th className="th text-right">Montants</th>
                <th className="th text-right">Alertes</th>
                <th className="th">Statut</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-line/70 last:border-0">
                  <td className="td tabular text-ink-2">
                    {new Date(h.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Bangui" })}
                  </td>
                  <td className="td">{periodLabel(h.period)}</td>
                  <td className="td max-w-[16rem] truncate" title={h.fileName}>{h.fileName}</td>
                  <td className="td tabular text-right">{h.nbDistributors}</td>
                  <td className="td tabular text-right">{h.nbSales}</td>
                  <td className="td tabular text-right">{h.nbIssues}</td>
                  <td className="td">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${h.status === "applied" ? "bg-good/10 text-ink" : "bg-surface-2 text-ink-2"}`}>
                      {STATUS[h.status] ?? h.status}
                    </span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={7} className="td py-6 text-center text-muted">Aucun import pour le moment.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
