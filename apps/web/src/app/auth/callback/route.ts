import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth/config";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";

function safeNext(value: string | null) {
  return value && value.startsWith("/") ? value : "/";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));
  const supabase = await createSupabaseAuthServerClient();

  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=misconfigured", requestUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=callback", requestUrl.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=callback", requestUrl.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=forbidden", requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
