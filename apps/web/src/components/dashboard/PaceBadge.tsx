import { AlertTriangle, CheckCircle2, CircleDashed, TrendingUp, XCircle } from "lucide-react";
import { PACE_LABEL, type PaceStatus } from "@/lib/format";

const STYLE: Record<PaceStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  done: { cls: "border-good/40 bg-good/10", Icon: CheckCircle2 },
  good: { cls: "border-good/40 bg-good/10", Icon: TrendingUp },
  warning: { cls: "border-warning/50 bg-warning/15", Icon: AlertTriangle },
  critical: { cls: "border-critical/40 bg-critical/10", Icon: XCircle },
  none: { cls: "border-line bg-surface-2", Icon: CircleDashed },
};

const ICON_COLOR: Record<PaceStatus, string> = {
  done: "text-good",
  good: "text-good",
  warning: "text-warning",
  critical: "text-critical",
  none: "text-muted",
};

/** Statut toujours accompagné d'une icône et d'un libellé (jamais la couleur seule). */
export function PaceBadge({ status }: { status: PaceStatus }) {
  const { cls, Icon } = STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-ink ${cls}`}>
      <Icon size={13} aria-hidden className={ICON_COLOR[status]} />
      {PACE_LABEL[status]}
    </span>
  );
}
