export type PfpAuthMode = "required" | "local-bypass";

const DEFAULT_ALLOWED_EMAIL = "pavel.vabrousek@gmail.com";

export function isProductionRuntime() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function getPfpAuthMode(): PfpAuthMode {
  const requestedMode = process.env.PFP_AUTH_MODE?.trim().toLowerCase();

  if (requestedMode === "local-bypass" && !isProductionRuntime()) {
    return "local-bypass";
  }

  if (requestedMode === "required") {
    return "required";
  }

  return isProductionRuntime() ? "required" : "local-bypass";
}

export function getAllowedEmails() {
  const configuredEmails = process.env.PFP_ALLOWED_EMAILS ?? process.env.PFP_ALLOWED_EMAIL ?? DEFAULT_ALLOWED_EMAIL;

  return configuredEmails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getAllowedEmails().includes(email.trim().toLowerCase());
}

export function canUseDemoFallback() {
  return getPfpAuthMode() === "local-bypass" && !isProductionRuntime();
}
