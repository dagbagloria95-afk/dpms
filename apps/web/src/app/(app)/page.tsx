import { FileUp } from "lucide-react";
import Link from "next/link";
import { PaceBadge } from "@/components/dashboard/PaceBadge";
import { PeriodSelect } from "@/components/dashboard/PeriodSelect";
import { RankingTable } from "@/components/dashboard/RankingTable";
import { RegionChart } from "@/components/dashboard/RegionChart";
import { StatTile } from "@/components/dashboard/StatTile";
import { WeeklyChart } from "@/components/dashboard/WeeklyChart";
import { getDashboard } from "@/lib/data";
import { compact, dateFr, fcfa, paceStatus, pct, periodLabel } from "@/lib/format";

export const metadata = { title: "Tableau de bord" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const { periode } = await searchParams;
  const data = await getDashboard(periode);

  if (!data) {
    return (
      <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold">Aucune donnée pour le moment</h1>
        <p className="mt-2 text-sm text-ink-2">
          Importez votre fichier Excel mensuel pour voir apparaître les performances des distributeurs.
        </p>
        <Link href="/import" className="btn-primary mt-5">
          <FileUp size={16} aria-hidden /> Importer un fichier
        </Link>
      </div>
    );
  }

  const { total } = data;
  const timeShare = data.joursDansMois ? data.joursEcoules / data.joursDansMois : 1;
  const status = paceStatus(total);
  const sansObjectif = data.rows.filter((r) => r.objectifTtc === null).length;
  const enRetard = data.rows.filter((r) => paceStatus(r) === "critical").length;
  const atteints = data.rows.filter((r) => paceStatus(r) === "done").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{periodLabel(data.period)}</h1>
          <p className="mt-1 text-sm text-ink-2">
            Chiffres arrêtés au <strong className="text-ink">{dateFr(data.asOf)}</strong> · jour {data.joursEcoules}/{data.joursDansMois}
            {data.lastImport && <> · dernier import : {data.lastImport.fileName}</>}
          </p>
        </div>
        <PeriodSelect periods={data.periods} value={data.period} />
      </header>

      <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Réalisé TTC"
          value={compact(total.realiseTtc)}
          unit="FCFA"
          sub={<>zebra {compact(total.realiseZebra)} · DW {compact(total.realiseDw)}</>}
        />
        <StatTile
          label="Taux de réalisation"
          value={pct(total.taux)}
          sub={<span className="inline-flex items-center gap-2">sur {compact(total.objectifTtc)} FCFA <PaceBadge status={status} /></span>}
        />
        <StatTile
          label="Reste à faire"
          value={compact(total.raf)}
          unit="FCFA"
          sub={data.joursRestants > 0 ? <>{fcfa(total.objectifJournalier)} FCFA / jour sur {data.joursRestants} j</> : "Mois terminé"}
        />
        <StatTile
          label="Projection fin de mois"
          value={compact(total.projection)}
          unit="FCFA"
          sub={<>au rythme de {compact(total.moyenneJournaliere)} FCFA / jour</>}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Répartition des distributeurs">
        <SummaryPill label="Objectif atteint" value={atteints} total={data.rows.length} />
        <SummaryPill label="En retard (projection < 80 %)" value={enRetard} total={data.rows.length} />
        <SummaryPill label="Sans objectif" value={sansObjectif} total={data.rows.length} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card p-4 sm:p-5 lg:col-span-3">
          <h2 className="font-semibold">Taux de réalisation par région</h2>
          <p className="mb-4 text-xs text-muted">Survolez une barre pour le détail.</p>
          <RegionChart regions={data.regions} timeShare={timeShare} />
        </section>
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="font-semibold">Réalisé par semaine</h2>
          <p className="mb-4 text-xs text-muted">Total TTC, réparti zebra / DW.</p>
          <WeeklyChart
            weeks={total.semaines.map((s) => ({ label: s.label, zebra: s.zebra ?? 0, dw: s.dw ?? 0 }))}
          />
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Classement des distributeurs</h2>
        <RankingTable
          rows={data.rows}
          regions={data.regions.map((r) => r.label)}
          timeShare={timeShare}
          period={data.period}
        />
      </section>
    </div>
  );
}

function SummaryPill({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="card flex items-center justify-between px-4 py-3">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="tabular text-lg font-semibold">
        {value}<span className="text-sm font-normal text-muted">/{total}</span>
      </span>
    </div>
  );
}
