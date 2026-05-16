import { getPfpAuthMode, isAllowedEmail } from "@/lib/auth/config";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth";

export type CurrentPfpUser = {
  authUserId: string;
  dataUserId: string;
  email: string;
  isLocalBypass: boolean;
};

export type AuthResolution =
  | {
      status: "authenticated";
      user: CurrentPfpUser;
    }
  | {
      status: "unauthenticated" | "forbidden" | "misconfigured";
      message: string;
    };

function configuredDataUserId(authUserId: string) {
  return process.env.PFP_SUPABASE_USER_ID?.trim() || authUserId;
}

function localBypassUser(): CurrentPfpUser | null {
  const userId = process.env.PFP_SUPABASE_USER_ID?.trim();

  if (!userId) {
    return null;
  }

  const email =
    process.env.PFP_LOCAL_USER_EMAIL?.trim() ??
    process.env.PFP_ALLOWED_EMAIL?.trim() ??
    process.env.PFP_ALLOWED_EMAILS?.split(",")[0]?.trim() ??
    "pavel.vabrousek@gmail.com";

  return {
    authUserId: userId,
    dataUserId: userId,
    email,
    isLocalBypass: true,
  };
}

export async function getCurrentPfpUser(): Promise<AuthResolution> {
  if (getPfpAuthMode() === "local-bypass") {
    const localUser = localBypassUser();

    if (localUser) {
      return { status: "authenticated", user: localUser };
    }
  }

  const supabase = await createSupabaseAuthServerClient();

  if (!supabase) {
    return {
      status: "misconfigured",
      message: "Supabase Auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      status: "unauthenticated",
      message: "Please sign in with Google to open PF Planner.",
    };
  }

  const email = user.email?.trim().toLowerCase() ?? "";

  if (!isAllowedEmail(email)) {
    return {
      status: "forbidden",
      message: "This Google account is not allowed to access PF Planner.",
    };
  }

  return {
    status: "authenticated",
    user: {
      authUserId: user.id,
      dataUserId: configuredDataUserId(user.id),
      email,
      isLocalBypass: false,
    },
  };
}
