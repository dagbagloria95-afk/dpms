import { redirect } from "next/navigation";
import { IS_DEMO } from "@/lib/env";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Connexion" };

export default function LoginPage() {
  if (IS_DEMO) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
            DP
          </div>
          <h1 className="text-xl font-semibold">Connexion administrateur</h1>
          <p className="mt-1 text-sm text-ink-2">Distributor Performance Management System</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
