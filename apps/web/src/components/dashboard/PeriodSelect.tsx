"use client";

import { useRouter } from "next/navigation";
import type { PeriodOption } from "@/lib/types";

export function PeriodSelect({ periods, value }: { periods: PeriodOption[]; value: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-2">Mois</span>
      <select
        className="input w-auto py-1.5"
        value={value}
        onChange={(e) => router.push(`/?periode=${e.target.value}`)}
      >
        {periods.map((p) => (
          <option key={p.code} value={p.code}>{p.label}</option>
        ))}
      </select>
    </label>
  );
}
