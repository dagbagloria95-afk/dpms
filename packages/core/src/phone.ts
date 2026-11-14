/**
 * Numéros de République centrafricaine : indicatif +236, 8 chiffres nationaux.
 */
export const CAR_COUNTRY_CODE = "236";

/**
 * Normalise un numéro au format E.164 (+236XXXXXXXX).
 * Accepte : 72188081, 72 18 80 81, 23672188081, +236 72188081, 0023672188081.
 * Retourne null si le numéro n'est pas exploitable.
 */
export function normalizeCarPhone(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  let digits = String(input).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith(CAR_COUNTRY_CODE)) {
    digits = digits.slice(3);
  }
  if (digits.length !== 8) return null;
  return `+${CAR_COUNTRY_CODE}${digits}`;
}

/** Affichage lisible : +236 72 18 80 81 */
export function formatCarPhone(e164: string): string {
  const national = e164.replace(/^\+236/, "");
  return `+236 ${national.replace(/(\d{2})(?=\d)/g, "$1 ")}`;
}
