"use client";

import { BarChart3, FileUp, MessageSquareText, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Tableau de bord", icon: BarChart3 },
  { href: "/import", label: "Import Excel", icon: FileUp },
  { href: "/distributeurs", label: "Distributeurs", icon: Users },
  { href: "/sms", label: "Campagnes SMS", icon: MessageSquareText, soon: true },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map(({ href, label, icon: Icon, soon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        if (soon) {
          return (
            <span
              key={href}
              className="flex shrink-0 cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted"
              title="Disponible à l'étape 4"
            >
              <Icon size={18} aria-hidden />
              <span>{label}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">bientôt</span>
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-accent/10 font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Icon size={18} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
