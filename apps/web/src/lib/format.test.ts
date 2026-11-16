import { describe, expect, it } from "vitest";
import { demoDashboard } from "./demo";
import { compact, dateFr, fcfa, paceStatus, pct } from "./format";

describe("format", () => {
  it("formate montants, taux et dates", () => {
    expect(fcfa(1_250_000.4)).toBe("1 250 000");
    expect(fcfa(null)).toBe("–");
    expect(compact(126_280_000)).toBe("126,28 M");
    expect(compact(43_500)).toBe("44 k");
    expect(pct(0.354)).toBe("35 %");
    expect(dateFr("2025-11-14")).toBe("14/11/2025");
  });

  it("évalue le rythme par rapport à l'objectif", () => {
    expect(paceStatus({ taux: 1.02, projection: 0, objectifTtc: 100 })).toBe("done");
    expect(paceStatus({ taux: 0.5, projection: 105, objectifTtc: 100 })).toBe("good");
    expect(paceStatus({ taux: 0.4, projection: 85, objectifTtc: 100 })).toBe("warning");
    expect(paceStatus({ taux: 0.2, projection: 50, objectifTtc: 100 })).toBe("critical");
    expect(paceStatus({ taux: null, projection: 50, objectifTtc: null })).toBe("none");
  });
});

describe("mode démonstration", () => {
  it("produit 34 distributeurs dans 6 régions avec des numéros valides", () => {
    const d = demoDashboard();
    expect(d.rows).toHaveLength(34);
    expect(d.regions.map((r) => r.nbDistributeurs)).toEqual([12, 3, 5, 3, 4, 7]);
    expect(d.rows.every((r) => /^\+236\d{8}$/.test(r.phone ?? ""))).toBe(true);
    expect(d.total.semaines).toHaveLength(4);
    expect(d.asOf).toBe("2025-11-14");
  });
});
