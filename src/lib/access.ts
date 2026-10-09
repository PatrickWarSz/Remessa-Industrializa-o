import type { Session } from "@supabase/supabase-js";

/**
 * Há sessão aberta? Quem protege os dados de verdade é o banco (políticas que só
 * aceitam a conta interna); aqui só decidimos entre mostrar o app ou a tela de senha.
 */
export function hasInternalAccess(session: Session | null | undefined): boolean {
  return !!session?.access_token;
}
