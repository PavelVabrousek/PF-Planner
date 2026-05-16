import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";

function safeNext(value: string | null) {
  return value && value.startsWith("/") ? value : "/";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeNext(requestUrl.searchParams.get("next"));
  const supabase = await createSupabaseAuthServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=misconfigured", requestUrl.origin));
  }

  const callbackUrl = new URL("/auth/callback", requestUrl.origin);
  callbackUrl.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(new URL("/login?error=callback", requestUrl.origin));
  }

  return NextResponse.redirect(data.url);
}
