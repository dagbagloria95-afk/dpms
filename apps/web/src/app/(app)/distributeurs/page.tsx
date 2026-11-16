import { getDistributors, getZones } from "@/lib/data";
import { DistributorsClient } from "./DistributorsClient";

export const metadata = { title: "Distributeurs" };

export default async function DistributorsPage() {
  const [distributors, zones] = await Promise.all([getDistributors(), getZones()]);
  const active = distributors.filter((d) => d.active).length;
  const invalid = distributors.filter((d) => !d.phone).length;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Distributeurs</h1>
        <p className="mt-1 text-sm text-ink-2">
          {distributors.length} distributeurs · {active} actifs · {zones.length} régions
          {invalid > 0 && <> · <span className="text-critical">{invalid} numéro(s) à corriger</span></>}
        </p>
      </header>
      <DistributorsClient distributors={distributors} zones={zones} />
    </div>
  );
}
