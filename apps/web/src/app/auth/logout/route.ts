import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const supabase = await createSupabaseAuthServerClient();

  await supabase?.auth.signOut();

  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
