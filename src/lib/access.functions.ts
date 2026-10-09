import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Trava única de acesso.
 *
 * O navegador só envia a senha. Quem confere a senha, escolhe a conta que já
 * guarda os dados e abre a sessão é o SERVIDOR — nenhuma credencial do banco
 * vai para o navegador. Se a senha estiver errada, nada é devolvido.
 *
 * Senha padrão: CRFITNESS. Para trocar sem mexer no código, defina a variável
 * de ambiente APP_ACCESS_PASSWORD no servidor.
 */
const DEFAULT_PASSWORD = "CRFITNESS";

// Tabelas usadas para descobrir a conta que é dona dos dados já gravados.
const OWNER_TABLES = ["periods", "companies", "factories", "product_groups"] as const;

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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");

    // 1) Descobre a conta que tem os dados gravados (a que mais aparece como dona).
    let ownerId: string | undefined;
    const ownerEmailEnv = process.env["APP_OWNER_EMAIL"];

    if (!ownerEmailEnv) {
      const counts = new Map<string, number>();
      for (const table of OWNER_TABLES) {
        const { data: rows, error } = await supabaseAdmin
          .from(table)
          .select("user_id")
          .not("user_id", "is", null)
          .limit(1000);
        if (error) throw new Error(`Falha ao localizar a conta dos dados: ${error.message}`);
        for (const r of rows ?? []) {
          if (r.user_id) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
        }
      }
      ownerId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!ownerId) {
        throw new Error(
          "Nenhuma conta com dados foi encontrada. Defina APP_OWNER_EMAIL com o e-mail da conta antiga.",
        );
      }
    }

    // 2) Resolve o e-mail da conta.
    let email = ownerEmailEnv;
    let userId = ownerId;
    if (ownerId) {
      const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(ownerId);
      if (error || !u.user?.email) throw new Error("Conta dona dos dados não encontrada.");
      email = u.user.email;
      userId = u.user.id;
    } else {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw new Error(error.message);
      const found = list.users.find((u) => u.email?.toLowerCase() === ownerEmailEnv!.toLowerCase());
      if (!found) throw new Error("APP_OWNER_EMAIL não corresponde a nenhuma conta.");
      email = found.email!;
      userId = found.id;
    }

    // 3) Marca a conta como "uso interno". Só o servidor consegue gravar app_metadata,
    //    então ninguém consegue se auto-promover criando uma conta nova.
    const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(userId!, {
      app_metadata: { internal_app: true },
    });
    if (metaErr) throw new Error(metaErr.message);

    // 4) Gera uma sessão real para essa conta (sem precisar da senha dela).
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email!,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) throw new Error(linkErr?.message ?? "Não foi possível abrir a sessão.");

    const url = process.env["SUPABASE_URL"]!;
    const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (verifyErr || !verified.session) {
      throw new Error(verifyErr?.message ?? "Não foi possível abrir a sessão.");
    }

    return {
      ok: true as const,
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    };
  });
