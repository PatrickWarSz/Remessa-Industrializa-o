import type { Session } from "@supabase/supabase-js";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * A sessão só libera o sistema se tiver a marca "internal_app", que apenas o
 * servidor (depois de conferir a senha) consegue colocar. É a mesma marca que o
 * banco exige nas políticas de segurança.
 */
export function hasInternalAccess(session: Session | null | undefined): boolean {
  if (!session?.access_token) return false;
  const payload = decodeJwtPayload(session.access_token);
  const meta = payload?.["app_metadata"] as Record<string, unknown> | undefined;
  return meta?.["internal_app"] === true;
}
