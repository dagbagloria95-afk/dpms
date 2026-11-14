/** Produits suivis dans le modèle Excel. */
export const PRODUCTS = ["zebra", "dw"] as const;
export type Product = (typeof PRODUCTS)[number];

/** Période mensuelle au format "AAAA-MM". */
export type PeriodCode = string;

/** Date du jour au format ISO "AAAA-MM-JJ". */
export type IsoDate = string;

export interface ImportedDistributor {
  /** Ligne Excel d'origine (1-based), pour les messages d'erreur. */
  row: number;
  region: string;
  name: string;
  /** Numéro tel que saisi dans la colonne STKA. */
  rawPhone: string;
  /** Numéro normalisé E.164 (+236XXXXXXXX), ou null si invalide. */
  phone: string | null;
  city: string;
  objectiveHt: number | null;
  objectiveTtc: number | null;
}

export interface DailySale {
  /** Index dans `ParsedMonthlyWorkbook.distributors`. */
  distributorIndex: number;
  date: IsoDate;
  product: Product;
  amount: number;
}

/** Une semaine telle que définie par les colonnes s1, s2… du modèle. */
export interface WeekBucket {
  label: string;
  dates: IsoDate[];
}

export type IssueLevel = "error" | "warning";

export interface ImportIssue {
  level: IssueLevel;
  row?: number;
  column?: string;
  message: string;
}

export interface ParsedMonthlyWorkbook {
  sheetName: string;
  period: PeriodCode;
  /** Toutes les dates présentes dans l'en-tête du modèle. */
  dates: IsoDate[];
  weeks: WeekBucket[];
  distributors: ImportedDistributor[];
  sales: DailySale[];
  issues: ImportIssue[];
}

export interface KpiSettings {
  /** TTC = HT × ttcRate. Par défaut 1,26. */
  ttcRate: number;
}

export const DEFAULT_KPI_SETTINGS: KpiSettings = { ttcRate: 1.26 };

export interface KpiValues {
  realiseZebra: number;
  realiseDw: number;
  realiseTtc: number;
  objectifHt: number | null;
  objectifTtc: number | null;
  /** Réalisé / objectif TTC (0,85 = 85 %). null si pas d'objectif. */
  taux: number | null;
  /** Reste à faire (jamais négatif). null si pas d'objectif. */
  raf: number | null;
  moyenneJournaliere: number;
  /** RAF ÷ jours restants. null si pas d'objectif ou mois terminé. */
  objectifJournalier: number | null;
  /** Projection fin de mois au rythme actuel. */
  projectionFinMois: number;
  /** Réalisé TTC par semaine (même ordre que `weeks`). */
  semaines: { label: string; realise: number }[];
}

export interface DistributorPerformance extends KpiValues {
  distributorIndex: number;
  name: string;
  region: string;
  /** Rang global (1 = meilleur taux). null si pas d'objectif. */
  rang: number | null;
  /** Rang dans la région. */
  rangRegion: number | null;
}

export interface GroupPerformance extends KpiValues {
  label: string;
  nbDistributeurs: number;
}

export interface PerformanceReport {
  period: PeriodCode;
  /** Dernier jour contenant des ventes (date d'arrêté des calculs). */
  asOf: IsoDate | null;
  joursDansMois: number;
  joursEcoules: number;
  joursRestants: number;
  distributors: DistributorPerformance[];
  regions: GroupPerformance[];
  total: GroupPerformance;
}
