import ExcelJS from "exceljs";

/**
 * Construit un classeur fictif qui reproduit la mise en page du modèle réel
 * (feuille "NOVEMBRE 2025") : dates fusionnées sur 2 colonnes, colonnes s1..s4,
 * régions fusionnées en colonne A, lignes de sous-total et ligne TOTAL.
 * Noms et numéros inventés : aucune donnée réelle dans le dépôt.
 */
export interface FixtureDistributor {
  region: string;
  name: string;
  phone: string | number;
  city: string;
  objHt?: number | string;
  objTtc?: number;
  /** montants par jour (1..30) : [zebra, dw] */
  sales?: Record<number, [number | string | null, number | string | null]>;
}

export async function buildFixture(
  distributors: FixtureDistributor[],
  opts: { sheetName?: string; year?: number; month?: number } = {},
): Promise<ArrayBuffer> {
  const year = opts.year ?? 2025;
  const month = opts.month ?? 11;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName ?? "NOVEMBRE 2025");
  const nbDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

  ws.getCell(1, 8).value = "1er/06/2025"; // ligne parasite du vrai modèle
  ["", "DISTRIBUTEURS ", "STKA", "VILLES", "objectifs HT", "objectifs TTC"].forEach((v, i) => {
    if (v) ws.getCell(3, i + 1).value = v;
  });

  // Colonnes journalières, avec une colonne "sN" après chaque dimanche.
  const dayCols = new Map<number, number>();
  let col = 7;
  let week = 1;
  for (let d = 1; d <= nbDays; d++) {
    ws.getCell(2, col).value = new Date(Date.UTC(year, month - 1, d));
    ws.mergeCells(2, col, 2, col + 1);
    ws.getCell(3, col).value = "zebra";
    ws.getCell(3, col + 1).value = "DW";
    dayCols.set(d, col);
    col += 2;
    const isSunday = new Date(Date.UTC(year, month - 1, d)).getUTCDay() === 0;
    if ((isSunday && d > 2) || d === nbDays) {
      ws.getCell(2, col).value = `s${week++}`;
      ws.mergeCells(2, col, 2, col + 1);
      ws.getCell(3, col).value = "zebra";
      ws.getCell(3, col + 1).value = "DW";
      col += 2;
    }
  }
  col += 1;
  ws.getCell(2, col + 2).value = "cumul TTC Novembre";
  ["zebra", "DW", "Realisés TTC", "R/0", "", "RAF global", "objectif journalier", "MOYENNE JOURNALIERE"].forEach(
    (v, i) => v && (ws.getCell(3, col + i).value = v),
  );

  let r = 4;
  let currentRegion = "";
  let regionStart = r;
  const closeRegion = () => {
    if (!currentRegion) return;
    if (r - 1 > regionStart) ws.mergeCells(regionStart, 1, r - 1, 1);
    ws.getCell(r, 1).value = 0; // ligne de sous-total
    ws.getCell(r, 5).value = { formula: `SUM(E${regionStart}:E${r - 1})`, result: 0 };
    r++;
  };
  for (const d of distributors) {
    if (d.region !== currentRegion) {
      closeRegion();
      currentRegion = d.region;
      regionStart = r;
      ws.getCell(r, 1).value = d.region;
    }
    // Comme dans le vrai fichier : nom issu d'une formule avec résultat en cache.
    ws.getCell(r, 2).value = { formula: `[1]mai!D${r}`, result: ` ${d.name} ` };
    ws.getCell(r, 3).value = d.phone;
    ws.getCell(r, 4).value = d.city;
    if (d.objHt !== undefined) ws.getCell(r, 5).value = d.objHt;
    if (d.objTtc !== undefined) ws.getCell(r, 6).value = d.objTtc;
    for (const [day, [z, dw]] of Object.entries(d.sales ?? {})) {
      const c = dayCols.get(Number(day))!;
      if (z !== null) ws.getCell(r, c).value = z;
      if (dw !== null) ws.getCell(r, c + 1).value = dw;
    }
    r++;
  }
  closeRegion();
  ws.getCell(r, 1).value = "TOTAL";
  ws.getCell(r + 4, 9).value = "zebra"; // résidus sous le tableau dans le vrai modèle
  ws.getCell(r + 5, 9).value = "dw";

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
