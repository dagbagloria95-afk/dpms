import { describe, expect, it } from "vitest";
import {
  buildSmsContext,
  computePerformance,
  formatAmount,
  normalizeCarPhone,
  parseMonthlyWorkbook,
  renderSmsTemplate,
  smsSegments,
  toGsmFriendly,
  unknownVariables,
} from "../src/index";
import { buildFixture, type FixtureDistributor } from "./buildFixture";

const sample: FixtureDistributor[] = [
  { region: "Région A", name: "ALPHA COM", phone: 70000001, city: "BANGUI", objHt: 1_000_000,
    sales: { 1: [100_000, 26_000], 2: [50_000, null], 10: [200_000, 0], 14: [10_000, 4_000] } },
  { region: "Région A", name: "BETA ETS", phone: "70 00 00 02", city: "BANGUI", objTtc: 500_000,
    sales: { 3: [300_000, 100_000] } },
  { region: "Région B", name: "GAMMA", phone: 70000003, city: "BOUAR", objHt: 2_000_000,
    sales: { 5: [400_000, 100_000], 14: ["1 000", "abc"] } },
  { region: "Région B", name: "DELTA SANS OBJECTIF", phone: 123, city: "BOUAR",
    sales: { 6: [5_000, 0] } },
];

describe("normalizeCarPhone", () => {
  it.each([
    [72188081, "+23672188081"],
    ["72 18 80 81", "+23672188081"],
    ["+236 72188081", "+23672188081"],
    ["0023672188081", "+23672188081"],
    ["23672188081", "+23672188081"],
  ])("%s -> %s", (input, expected) => expect(normalizeCarPhone(input)).toBe(expected));

  it.each([[123], [""], [null], ["7218808"], ["721880811"]])("rejette %s", (input) =>
    expect(normalizeCarPhone(input)).toBeNull(),
  );
});

describe("parseMonthlyWorkbook", () => {
  it("lit la structure du modèle mensuel", async () => {
    const parsed = await parseMonthlyWorkbook(await buildFixture(sample));
    expect(parsed.sheetName).toBe("NOVEMBRE 2025");
    expect(parsed.period).toBe("2025-11");
    expect(parsed.dates).toHaveLength(30);
    expect(parsed.weeks.map((w) => w.label)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(parsed.weeks[0]!.dates.at(-1)).toBe("2025-11-09");
    expect(parsed.weeks.at(-1)!.dates.at(-1)).toBe("2025-11-30");

    expect(parsed.distributors.map((d) => [d.region, d.name, d.phone, d.city])).toEqual([
      ["Région A", "ALPHA COM", "+23670000001", "BANGUI"],
      ["Région A", "BETA ETS", "+23670000002", "BANGUI"],
      ["Région B", "GAMMA", "+23670000003", "BOUAR"],
      ["Région B", "DELTA SANS OBJECTIF", null, "BOUAR"],
    ]);
    expect(parsed.distributors[0]!.objectiveHt).toBe(1_000_000);
    expect(parsed.distributors[1]!.objectiveTtc).toBe(500_000);
  });

  it("extrait les ventes journalières et signale les anomalies", async () => {
    const parsed = await parseMonthlyWorkbook(await buildFixture(sample));
    const alpha = parsed.sales.filter((s) => s.distributorIndex === 0);
    expect(alpha).toHaveLength(6); // les zéros et cellules vides sont ignorés
    expect(alpha.find((s) => s.date === "2025-11-01" && s.product === "dw")?.amount).toBe(26_000);

    const gamma14 = parsed.sales.filter((s) => s.distributorIndex === 2 && s.date === "2025-11-14");
    expect(gamma14).toEqual([{ distributorIndex: 2, date: "2025-11-14", product: "zebra", amount: 1000 }]);

    const messages = parsed.issues.map((i) => i.message).join("\n");
    expect(messages).toContain('montant "abc" illisible');
    expect(messages).toContain('numéro "123" invalide');
    expect(parsed.issues.every((i) => i.level === "warning")).toBe(true);
  });

  it("refuse les numéros en double", async () => {
    const dup = [sample[0]!, { ...sample[1]!, phone: 70000001 }];
    const parsed = await parseMonthlyWorkbook(await buildFixture(dup));
    expect(parsed.issues.some((i) => i.level === "error" && i.message.includes("déjà utilisé"))).toBe(true);
  });

  it("rejette un fichier qui n'est pas le modèle", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Feuil1").getCell("A1").value = "autre chose";
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    await expect(parseMonthlyWorkbook(buf)).rejects.toThrow(/DISTRIBUTEURS/);
  });
});

describe("computePerformance", () => {
  it("calcule les indicateurs, classements et totaux", async () => {
    const parsed = await parseMonthlyWorkbook(await buildFixture(sample));
    const report = computePerformance(parsed);

    expect(report.asOf).toBe("2025-11-14");
    expect(report.joursEcoules).toBe(14);
    expect(report.joursRestants).toBe(16);

    const [alpha, beta, gamma, delta] = report.distributors;
    // ALPHA : 100k+26k+50k+200k+10k+4k = 390k TTC ; objectif 1M HT × 1,26 = 1,26M TTC
    expect(alpha!.realiseZebra).toBe(360_000);
    expect(alpha!.realiseDw).toBe(30_000);
    expect(alpha!.realiseTtc).toBe(390_000);
    expect(alpha!.objectifTtc).toBe(1_260_000);
    expect(alpha!.raf).toBe(870_000);
    expect(alpha!.taux).toBeCloseTo(390_000 / 1_260_000);
    expect(alpha!.moyenneJournaliere).toBeCloseTo(390_000 / 14, 1);
    expect(alpha!.objectifJournalier).toBeCloseTo(870_000 / 16, 1);
    expect(alpha!.semaines.map((s) => s.realise)).toEqual([176_000, 214_000, 0, 0]);

    // BETA : objectif saisi en TTC, HT déduit
    expect(beta!.objectifTtc).toBe(500_000);
    expect(beta!.objectifHt).toBeCloseTo(500_000 / 1.26, 1);
    expect(beta!.taux).toBeCloseTo(0.8);
    expect(beta!.rang).toBe(1);
    expect(alpha!.rang).toBe(2);
    expect(gamma!.rang).toBe(3);
    expect(gamma!.rangRegion).toBe(1);

    // Sans objectif : pas de taux ni de rang
    expect(delta!.taux).toBeNull();
    expect(delta!.rang).toBeNull();
    expect(delta!.raf).toBeNull();

    expect(report.regions.map((r) => [r.label, r.nbDistributeurs, r.realiseTtc])).toEqual([
      ["Région A", 2, 790_000],
      ["Région B", 2, 506_000],
    ]);
    expect(report.total.realiseTtc).toBe(1_296_000);
    expect(report.total.objectifTtc).toBe(1_260_000 + 500_000 + 2_520_000);
  });

  it("met le RAF à zéro quand l'objectif est dépassé", () => {
    const report = computePerformance({
      period: "2025-11",
      weeks: [],
      distributors: [{ name: "X", region: "R", objectiveHt: null, objectiveTtc: 100 }],
      sales: [{ distributorIndex: 0, date: "2025-11-30", product: "zebra", amount: 150 }],
    });
    const x = report.distributors[0]!;
    expect(x.raf).toBe(0);
    expect(x.taux).toBe(1.5);
    expect(x.objectifJournalier).toBeNull(); // mois terminé
  });
});

describe("SMS", () => {
  it("personnalise un modèle", async () => {
    const parsed = await parseMonthlyWorkbook(await buildFixture(sample));
    const report = computePerformance(parsed);
    const ctx = buildSmsContext(report, report.distributors[0]!, { city: "BANGUI" });
    const tpl =
      "Bonjour {{nom}}, au {{date_arrete}} votre réalisé {{periode}} est de {{realise}} FCFA " +
      "sur {{objectif}} ({{taux}}). Rang {{rang}}/{{nb_distributeurs}}. {{inconnue}}";
    expect(renderSmsTemplate(tpl, ctx)).toBe(
      "Bonjour ALPHA COM, au 14/11/2025 votre réalisé Novembre 2025 est de 390 000 FCFA " +
        "sur 1 260 000 (31%). Rang 2/3. {{inconnue}}",
    );
    expect(unknownVariables(tpl)).toEqual(["inconnue"]);
  });

  it("compte les segments GSM et Unicode", () => {
    expect(smsSegments("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1, remaining: 0 });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("Réalisé à 85%").encoding).toBe("GSM-7"); // é et à sont GSM
    const u = smsSegments("Félicitations, très bien joué ! Prêt ?");
    expect(u.encoding).toBe("UCS-2");
    expect(u.unicodeChars).toEqual(["ê"]);
    expect(smsSegments(toGsmFriendly("Prêt ? Ça marche")).encoding).toBe("GSM-7");
  });

  it("formate les montants", () => {
    expect(formatAmount(1_250_000.4)).toBe("1 250 000");
    expect(formatAmount(999)).toBe("999");
    expect(formatAmount(null)).toBe("-");
  });
});
