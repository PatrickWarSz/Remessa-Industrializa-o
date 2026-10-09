import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Trava única de acesso.
 *
 * O navegador só envia a senha de acesso. O SERVIDOR confere e, se estiver certa,
 * entra na conta interna (e-mail/senha guardados como segredos do servidor) e
 * devolve a sessão. A conta e a senha dela nunca vão para o navegador.
 *
 * Segredos (Cloud → Secrets):
 *   APP_LOGIN_EMAIL     e-mail da conta que tem os dados gravados
 *   APP_LOGIN_PASSWORD  senha dessa conta
 *   APP_ACCESS_PASSWORD (opcional) senha de acesso; se faltar, vale CRFITNESS
 */
const DEFAULT_PASSWORD = "CRFITNESS";

function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const unlockApp = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string().max(200) }))
  .handler(async ({ data }) => {
    const expected = process.env["APP_ACCESS_PASSWORD"] || DEFAULT_PASSWORD;

    if (!safeEqual(data.password.trim(), expected)) {
      await sleep(900); // freia tentativas em sequência
      return { ok: false as const, error: "Senha incorreta." };
    }

    const email = process.env["APP_LOGIN_EMAIL"];
    const password = process.env["APP_LOGIN_PASSWORD"];
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!email || !password) {
      return {
        ok: false as const,
        error: "Falta configurar APP_LOGIN_EMAIL e APP_LOGIN_PASSWORD nos segredos.",
      };
    }
    if (!url || !key) {
      return { ok: false as const, error: "Supabase não configurado no servidor." };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: signed, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !signed.session) {
      return {
        ok: false as const,
        error: "Não foi possível entrar na conta interna (confira APP_LOGIN_EMAIL/APP_LOGIN_PASSWORD).",
      };
    }

    return {
      ok: true as const,
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
    };
  });
