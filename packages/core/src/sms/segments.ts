/**
 * Comptage des SMS facturés : un SMS GSM-7 fait 160 caractères (153 par
 * segment au-delà) ; un seul caractère hors alphabet GSM (ê, ç, emoji…)
 * fait passer tout le message en Unicode : 70 caractères (67 par segment).
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

const basic = new Set(GSM_BASIC);
const extended = new Set(GSM_EXTENDED);

export interface SmsSegmentInfo {
  encoding: "GSM-7" | "UCS-2";
  /** Longueur comptée (les caractères étendus GSM comptent double). */
  length: number;
  segments: number;
  /** Caractères restants avant le segment suivant. */
  remaining: number;
  /** Caractères qui forcent l'Unicode. */
  unicodeChars: string[];
}

export function smsSegments(text: string): SmsSegmentInfo {
  const chars = [...text];
  const unicodeChars = [...new Set(chars.filter((c) => !basic.has(c) && !extended.has(c)))];
  if (unicodeChars.length === 0) {
    const length = chars.reduce((n, c) => n + (extended.has(c) ? 2 : 1), 0);
    const per = length <= 160 ? 160 : 153;
    const segments = Math.max(1, Math.ceil(length / per));
    return { encoding: "GSM-7", length, segments, remaining: segments * per - length, unicodeChars };
  }
  // En UCS-2, les caractères hors BMP (emoji) occupent 2 unités.
  const length = chars.reduce((n, c) => n + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  const per = length <= 70 ? 70 : 67;
  const segments = Math.max(1, Math.ceil(length / per));
  return { encoding: "UCS-2", length, segments, remaining: segments * per - length, unicodeChars };
}

/** Remplace les accents hors alphabet GSM (ê → e, ç → c…) pour rester à 160 caractères. */
export function toGsmFriendly(text: string): string {
  return [...text]
    .map((c) => {
      if (basic.has(c) || extended.has(c)) return c;
      const stripped = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if ([...stripped].every((s) => basic.has(s))) return stripped;
      if (c === "’" || c === "‘") return "'";
      if (c === "“" || c === "”" || c === "«" || c === "»") return '"';
      if (c === " " || c === " ") return " ";
      if (c === "–" || c === "—") return "-";
      return c;
    })
    .join("");
}
