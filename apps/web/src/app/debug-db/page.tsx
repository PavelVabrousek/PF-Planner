import { Bell, LogOut, Search, UserCircle2 } from "lucide-react";
import { redirect } from "next/navigation";
import { DbDebugScreen } from "@/components/db-debug-screen";
import { ModeSwitcher } from "@/components/mode-switcher";
import { getCurrentPfpUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function DebugDbPage() {
  const auth = await getCurrentPfpUser();

  if (auth.status !== "authenticated") {
    if (auth.status === "forbidden") {
      redirect("/login?error=forbidden");
    }

    redirect(`/login?next=/debug-db&error=${auth.status === "misconfigured" ? "misconfigured" : ""}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 pb-6 pt-3 sm:px-5 lg:px-6">
      <header className="sticky top-0 z-20 -mx-3 border-b border-white/5 bg-background/90 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <div className="flex items-center gap-2">
          <ModeSwitcher activeModeId="debug" />
          <button
            type="button"
            aria-label="Search"
            title="Search"
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50 sm:flex"
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50"
          >
            <Bell size={17} />
          </button>
          <div
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 md:flex"
            title={`${auth.user.email} · ${auth.user.isLocalBypass ? "Local bypass" : "Google login"}`}
            aria-label={`${auth.user.email} user session`}
          >
            <UserCircle2 size={17} />
          </div>
          <a
            href="/auth/logout"
            aria-label="Sign out"
            title="Sign out"
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-panel text-slate-300 hover:border-neutral/50 hover:text-slate-50 md:flex"
          >
            <LogOut size={16} />
          </a>
        </div>
      </header>

      <DbDebugScreen />
    </main>
  );
}
