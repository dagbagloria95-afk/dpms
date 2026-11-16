import { LogOut } from "lucide-react";
import { Nav } from "@/components/Nav";
import { getCurrentUserEmail } from "@/lib/data";
import { IS_DEMO } from "@/lib/env";
import { signOut } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const email = await getCurrentUserEmail();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-4 p-3 md:p-4">
          <div className="flex items-center gap-2 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-ink">
              DP
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">DPMS</div>
              <div className="text-xs text-muted">Performances distributeurs</div>
            </div>
          </div>
          <Nav />
          <div className="mt-auto hidden border-t border-line pt-3 md:block">
            <div className="truncate px-1 text-xs text-muted" title={email ?? ""}>{email}</div>
            {!IS_DEMO && (
              <form action={signOut}>
                <button className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-ink-2 hover:text-ink">
                  <LogOut size={16} aria-hidden /> Se déconnecter
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {IS_DEMO && (
          <div className="border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm text-ink">
            <strong>Mode démonstration</strong> : données fictives. La base de données n&apos;est pas encore connectée.
          </div>
        )}
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
