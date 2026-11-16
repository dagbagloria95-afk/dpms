/**
 * Point d'entrée léger, utilisable dans le navigateur : tout sauf la lecture
 * Excel (ExcelJS est volumineux et réservé au serveur).
 */
export * from "./types";
export * from "./phone";
export * from "./dates";
export { computePerformance, objectiveHt, objectiveTtc } from "./kpi/computePerformance";
export type { PerformanceInput } from "./kpi/computePerformance";
export * from "./sms/template";
export * from "./sms/segments";
