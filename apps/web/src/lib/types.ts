/** Indicateurs communs à un distributeur, une région ou le total. */
export interface Kpis {
  realiseZebra: number;
  realiseDw: number;
  realiseTtc: number;
  objectifHt: number | null;
  objectifTtc: number | null;
  taux: number | null;
  raf: number | null;
  moyenneJournaliere: number;
  objectifJournalier: number | null;
  projection: number;
  semaines: { label: string; realise: number; zebra: number; dw: number }[];
}

export interface PerformanceRow extends Kpis {
  distributorId: string;
  name: string;
  region: string;
  city: string;
  phone: string | null;
  active: boolean;
  rang: number | null;
  rangRegion: number | null;
}

export interface GroupRow extends Kpis {
  label: string;
  nbDistributeurs: number;
}

export interface PeriodOption {
  code: string;
  label: string;
}

export interface DashboardData {
  period: string;
  periods: PeriodOption[];
  asOf: string | null;
  joursDansMois: number;
  joursEcoules: number;
  joursRestants: number;
  total: GroupRow;
  regions: GroupRow[];
  rows: PerformanceRow[];
  lastImport: { fileName: string; createdAt: string } | null;
}

export interface Zone {
  id: string;
  name: string;
}

export interface Distributor {
  id: string;
  name: string;
  phone: string | null;
  rawPhone: string | null;
  city: string;
  zoneId: string | null;
  zoneName: string;
  active: boolean;
}

export interface ImportHistoryItem {
  id: string;
  period: string;
  fileName: string;
  status: string;
  nbDistributors: number;
  nbSales: number;
  nbIssues: number;
  createdAt: string;
}
