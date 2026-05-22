import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getPfpAuthMode } from "@/lib/auth/config";
import { getCurrentPfpUser } from "@/lib/auth/current-user";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function messageForError(error: string | undefined) {
  if (error === "forbidden") {
    return "This Google account is not allowed to access PF Planner.";
  }

  if (error === "misconfigured") {
    return "Supabase Auth is not configured for this deployment.";
  }

  if (error === "callback") {
    return "Google sign-in did not complete. Please try again.";
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;
  const errorParam = Array.isArray(params.error) ? params.error[0] : params.error;
  const auth = await getCurrentPfpUser();

  if (auth.status === "authenticated") {
    redirect(nextParam && nextParam.startsWith("/") ? nextParam : "/");
  }

  const message = messageForError(errorParam) ?? (auth.status === "misconfigured" ? auth.message : null);
  const isLocalBypass = getPfpAuthMode() === "local-bypass";

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-slate-100">
      <section className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-5 shadow-panel">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">PF Planner</p>
            <h1 className="text-lg font-semibold text-slate-50">Sign in</h1>
          </div>
        </div>

        <p className="mb-5 text-sm leading-5 text-slate-400">
          Production access is restricted to the configured Google account.
        </p>

        {message ? (
          <p className="mb-4 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-red-200">
            {message}
          </p>
        ) : null}

        {isLocalBypass ? (
          <Link
            href="/"
            className="flex h-10 items-center justify-center rounded-md bg-neutral px-3 text-sm font-medium text-white hover:bg-blue-500"
          >
            Continue locally
          </Link>
        ) : (
          <form action="/auth/login" method="get">
            <input type="hidden" name="next" value={nextParam && nextParam.startsWith("/") ? nextParam : "/"} />
            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center rounded-md bg-neutral px-3 text-sm font-medium text-white hover:bg-blue-500"
            >
              Continue with Google
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
